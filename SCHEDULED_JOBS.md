# Scheduled jobs

All scheduled work runs through one HTTP endpoint:

```
GET|POST /api/internal/jobs/:name
Authorization: Bearer $CRON_SECRET
```

Defined in [`src/modules/jobs/jobs.router.ts`](src/modules/jobs/jobs.router.ts).
`node-cron` in `server.ts` fires the same jobs in local dev; on Vercel the
instance is frozen between requests so those timers never tick, which is why
production drives them over HTTP. **Every job is idempotent**, so an extra run —
or both schedulers firing at once — is harmless.

## `CRON_SECRET` is mandatory

If `CRON_SECRET` is empty the endpoint returns **404**, so every scheduled job
stops without any error appearing anywhere. Set it on the Vercel project
(Settings → Environment Variables) as well as in `.env`.

Vercel Cron sends it automatically as `Authorization: Bearer $CRON_SECRET` — the
variable name is fixed by Vercel, so do not rename it.

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## Who runs what

The Vercel **Hobby plan caps cron at once per day and fails the deploy** on any
tighter expression. The four sub-daily jobs are therefore driven by an external
scheduler instead.

### Vercel Cron — in `vercel.json`

| Job | Schedule | UTC |
| --- | --- | --- |
| `voucher-expiry` | daily | `0 19 * * *` |
| `campaign-reconcile` | daily | `30 19 * * *` |
| `voucher-expiry-reminder` | daily | `0 2 * * *` |
| `loyalty-reset-warning` | 1 Dec, yearly | `0 2 1 12 *` |
| `loyalty-annual-reset` | 31 Dec, yearly | `0 17 31 12 *` |

Hobby timing is approximate: a job set for 02:00 fires somewhere in the 02:00–02:59
window. None of these care.

### External cron — NOT in `vercel.json`

| Job | Interval | Cron expression | Why it cannot wait a day |
| --- | --- | --- | --- |
| `order-expiry` | 5 min | `*/5 * * * *` | Cancels unpaid bookings past the 15-min window. Daily = an unpaid order holds its slot for 24h. |
| `voucher-reservation-sweep` | 5 min | `*/5 * * * *` | Releases voucher holds from lapsed payments. Daily = the voucher stays locked 24h. |
| `cash-no-show` | 10 min | `*/10 * * * *` | Marks unclaimed cash bookings NO_SHOW after the 30-min grace. |
| `campaign-lifecycle` | 1 hour | `0 * * * *` | Starts SCHEDULED campaigns and retires ended ones. Daily = up to 24h late. |

Adding these back into `vercel.json` will fail the deploy while the project is on
Hobby. Upgrading to Pro is the only way to host them there.

## Setting up the external cron

Any scheduler that can send a header works. [cron-job.org](https://cron-job.org)
is free, does 1-minute resolution, and has no monthly execution cap — these four
jobs together are ~744 calls/day, which exceeds some free tiers (Upstash QStash
allows 500/day, for example).

For each of the four rows above, create a job with:

- **URL** — `https://wash-auto.vercel.app/api/internal/jobs/<job-name>`
- **Method** — `GET`
- **Schedule** — the cron expression from the table
- **Header** — `Authorization: Bearer <your CRON_SECRET>`

Verify one by hand before trusting the schedule:

```bash
curl -i -H "Authorization: Bearer $CRON_SECRET" \
  https://wash-auto.vercel.app/api/internal/jobs/order-expiry
```

Expected responses:

| Code | Meaning |
| --- | --- |
| `200` | Ran. Body is `{ job, durationMs, result }`. |
| `401` | Secret is wrong. |
| `404` | `CRON_SECRET` is not set on the server, **or** the job name is misspelled. |

`x-cron-secret: <secret>` is accepted as an alternative to the bearer header if a
scheduler makes that easier.

## Adding a job

1. Add the runner to the `JOBS` map in `jobs.router.ts`. Make it idempotent.
2. Daily or rarer → add it to `crons` in `vercel.json`. More frequent → add it to
   the external scheduler and to the table above.
3. Add it to `server.ts` if it should also run in local dev.

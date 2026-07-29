/*
 * Rebuilds `users.phone` and `users.google_id` as PARTIAL unique indexes, so
 * that they are unique only among documents that actually have them. Google
 * accounts have no phone; password accounts have no google_id.
 *
 * What goes wrong without it: a plain unique index stores a MISSING field as
 * null and indexes that null. The FIRST phone-less Google sign-up succeeds; the
 * SECOND dies with `E11000 duplicate key: phone_1 dup key: { phone: null }`.
 * One user gets in and everyone after them is locked out — and the error names
 * a field the user never supplied, so it reads as a mystery. (The app does not
 * write `phone: null`; Mongoose drops undefined keys. The null in that message
 * is MongoDB describing how it indexed the absent field.)
 *
 * Why a script and not just the schema change: an index's options are immutable.
 * `createIndex` with the same key pattern but different options fails with
 * IndexOptionsConflict, and Mongoose's autoIndex swallows that into an 'index'
 * event nobody listens to — so the app boots looking healthy while the OLD
 * index carries on rejecting writes.
 *
 * Why partial rather than sparse: both work for the writes this code makes,
 * because it only ever omits the key. Sparse skips a MISSING field but still
 * indexes one that is present and explicitly null, so it would stop covering us
 * the day some other path writes `phone: null`. `$type: 'string'` indexes a
 * document only when the value is really a string, which is the actual rule.
 *
 * Guarantees:
 *   - Idempotent. Re-running against correct indexes is a no-op.
 *   - Only `phone` is written, and only where it is explicitly `null` — that key
 *     is removed. No other field is modified.
 *   - Safe to run before deploying the new code: the old code never created a
 *     phone-less user, so the new index is equivalent for it.
 *
 * Run once, BEFORE or WITH the deploy that adds Google sign-in:
 *   pnpm exec ts-node scripts/migrate-google-auth.ts
 *
 * Dry run (reports what it would do, writes nothing):
 *   pnpm exec ts-node scripts/migrate-google-auth.ts --dry-run
 *
 * Rollback: only possible while every user still has a phone.
 *   db.users.dropIndex('phone_1');
 *   db.users.createIndex({ phone: 1 }, { unique: true });
 *
 * There is a brief window between each drop and recreate during which two
 * concurrent writes could insert the same phone number. On a system this size
 * that is a fraction of a second; run it off-peak if that still bothers you.
 */
import mongoose from 'mongoose';
import { config } from '../src/config';

const dryRun = process.argv.includes('--dry-run');

interface IIndexInfo {
  name: string;
  key: Record<string, number>;
  unique?: boolean;
  sparse?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

type Users = ReturnType<typeof mongoose.connection.collection>;

/** What the schema declares — see src/modules/auth/user.model.ts. */
const wanted = (field: string) => ({
  unique: true,
  partialFilterExpression: { [field]: { $type: 'string' } },
});

/** True when the live index already matches what the schema wants. */
function isCorrect(index: IIndexInfo, field: string): boolean {
  const filter = index.partialFilterExpression?.[field] as
    | { $type?: unknown }
    | undefined;
  return index.unique === true && filter?.$type === 'string';
}

async function ensureUniqueWhenPresent(
  users: Users,
  field: 'phone' | 'google_id',
  indexes: IIndexInfo[],
): Promise<void> {
  const name = `${field}_1`;
  const existing = indexes.find((i) => i.name === name);

  if (existing && isCorrect(existing, field)) {
    console.log(`${name} is already unique + partial — nothing to do.`);
    return;
  }

  if (existing) {
    console.log(
      `Rebuilding ${name} (unique=${String(existing.unique)} ` +
        `sparse=${String(existing.sparse)} ` +
        `partial=${existing.partialFilterExpression ? 'yes' : 'no'}) ` +
        `as unique + partial on $type:'string'.`,
    );
    // Index options are immutable, so the old one has to go first. There is a
    // sub-second window here with no uniqueness on the field; run it off-peak if
    // that matters.
    if (!dryRun) await users.dropIndex(name);
  } else {
    console.log(`No ${name} index — creating it unique + partial.`);
  }

  if (!dryRun) await users.createIndex({ [field]: 1 }, wanted(field));
}

async function main(): Promise<void> {
  await mongoose.connect(config.database.uri, { dbName: config.database.name });
  const users = mongoose.connection.collection('users');
  console.log(
    `Connected to ${config.database.name}${dryRun ? ' (dry run)' : ''}`,
  );

  const indexes = (await users.indexes()) as unknown as IIndexInfo[];
  await ensureUniqueWhenPresent(users, 'phone', indexes);
  await ensureUniqueWhenPresent(users, 'google_id', indexes);

  // Data hygiene, not a correctness requirement: a partial index on
  // `$type: 'string'` already ignores nulls. But `phone: null` would serialise
  // into the API as a third state alongside "a string" and "absent", which the
  // frontend contract (phone?: string) does not allow for.
  //
  // `{ phone: null }` would be the WRONG query here — in MongoDB that also
  // matches documents with no `phone` field at all, i.e. every Google account.
  // `$type: 'null'` matches only a field that is present and null.
  const explicitNulls = await users.countDocuments({
    phone: { $type: 'null' },
  });
  if (explicitNulls > 0) {
    console.log(
      `Unsetting ${explicitNulls} explicit \`phone: null\` value(s).`,
    );
    if (!dryRun) {
      await users.updateMany(
        { phone: { $type: 'null' } },
        { $unset: { phone: '' } },
      );
    }
  }

  console.log(
    dryRun ? 'Dry run complete — nothing written.' : 'Migration complete.',
  );
  await mongoose.disconnect();
}

main().catch(async (error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});

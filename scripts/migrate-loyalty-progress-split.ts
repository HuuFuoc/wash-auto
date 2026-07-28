/*
 * Backfills the lifetime counters that annual reset must never touch.
 *
 * The old schema kept ONE points figure, which the annual reset zeroed along
 * with the voucher progress. Splitting them means a customer can be told "you
 * have earned 4,320 points with us" after a reset, and a customer sitting at
 * 9/10 washes on 31 December no longer loses that overnight.
 *
 * Backfill strategy, and its honest limits:
 *   - `lifetime_points`     seeded from LOYALTY TRANSACTIONS where available
 *     (the sum of every positive pointsDelta ever recorded). That is the real
 *     history. Accounts with no transaction rows fall back to the current
 *     balance, which UNDERSTATES anyone who has already been through a reset —
 *     there is no record left to recover those points from.
 *   - `lifetime_spend_vnd`  seeded from completed orders.
 *   - `lifetime_saved_vnd`  seeded from the discount recorded on those orders.
 *
 * Guarantees:
 *   - Idempotent. Accounts whose lifetime fields are already populated are
 *     skipped, so re-running changes nothing.
 *   - Non-destructive. Only the three new columns are written; points_balance,
 *     tier and voucher progress are left exactly as they are.
 *
 * Run once, after deploying the Phase 4 code:
 *   pnpm exec ts-node scripts/migrate-loyalty-progress-split.ts
 *
 * Dry run:
 *   pnpm exec ts-node scripts/migrate-loyalty-progress-split.ts --dry-run
 *
 * Rollback: `db.loyalty_accounts.updateMany({}, { $unset: {
 *   lifetime_points: "", lifetime_spend_vnd: "", lifetime_saved_vnd: "",
 *   last_annual_reset_year: "" } })`. The schema defaults them back to 0, so the
 * app keeps working — it simply forgets the reconstructed history.
 */
import mongoose, { Types } from 'mongoose';
import { config } from '../src/config';
import { LoyaltyAccountModel } from '../src/modules/loyalty/loyalty-account.model';
import { LoyaltyTransactionModel } from '../src/modules/loyalty/loyalty-transaction.model';
import { OrderModel } from '../src/modules/order/order.model';
import { OrderStatusEnum } from '../src/shared/order/types/order-status.enum';

const DRY_RUN = process.argv.includes('--dry-run');

interface AccountRow {
  _id: Types.ObjectId;
  customer_id: Types.ObjectId;
  points_balance: number;
  lifetime_points?: number;
}

/** Sum of every point ever ADDED, per customer. Losses are not subtracted. */
async function earnedPointsByCustomer(): Promise<Map<string, number>> {
  const rows = await LoyaltyTransactionModel.aggregate<{
    _id: Types.ObjectId;
    earned: number;
  }>([
    { $match: { points_delta: { $gt: 0 } } },
    { $group: { _id: '$customer_id', earned: { $sum: '$points_delta' } } },
  ]).exec();
  return new Map(rows.map((r) => [r._id.toString(), r.earned]));
}

/** Completed-order totals per customer: what they paid and what they saved. */
async function orderTotalsByCustomer(): Promise<
  Map<string, { spend: number; saved: number }>
> {
  const rows = await OrderModel.aggregate<{
    _id: Types.ObjectId;
    spend: number;
    saved: number;
  }>([
    { $match: { status: OrderStatusEnum.COMPLETED } },
    {
      $group: {
        _id: '$customer_id',
        spend: { $sum: '$amount' },
        saved: { $sum: '$discount_amount' },
      },
    },
  ]).exec();
  return new Map(
    rows.map((r) => [r._id.toString(), { spend: r.spend, saved: r.saved }]),
  );
}

async function main(): Promise<void> {
  await mongoose.connect(config.database.uri);

  const accounts = await LoyaltyAccountModel.find({
    $or: [
      { lifetime_points: { $exists: false } },
      { lifetime_points: 0, points_balance: { $gt: 0 } },
    ],
  })
    .select({ _id: 1, customer_id: 1, points_balance: 1, lifetime_points: 1 })
    .lean<AccountRow[]>();

  if (accounts.length === 0) {
    console.log(
      JSON.stringify({ scanned: 0, message: 'Nothing to backfill' }, null, 2),
    );
    await mongoose.disconnect();
    return;
  }

  const [earnedByCustomer, totalsByCustomer] = await Promise.all([
    earnedPointsByCustomer(),
    orderTotalsByCustomer(),
  ]);

  let updated = 0;
  let fellBackToBalance = 0;

  for (const account of accounts) {
    const key = account.customer_id.toString();
    const earned = earnedByCustomer.get(key);
    // No transaction history to reconstruct from → the current balance is the
    // best available lower bound.
    if (earned === undefined) fellBackToBalance += 1;
    const lifetimePoints = earned ?? account.points_balance;
    const totals = totalsByCustomer.get(key) ?? { spend: 0, saved: 0 };

    if (DRY_RUN) {
      updated += 1;
      continue;
    }

    const res = await LoyaltyAccountModel.updateOne(
      { _id: account._id },
      {
        $set: {
          lifetime_points: lifetimePoints,
          lifetime_spend_vnd: totals.spend,
          lifetime_saved_vnd: totals.saved,
        },
      },
    );
    updated += res.modifiedCount ?? 0;
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        scannedAccounts: accounts.length,
        updated,
        fellBackToCurrentBalance: fellBackToBalance,
        note:
          'Accounts with no loyalty_transactions history get lifetime_points = ' +
          'current balance, which understates anyone already through a reset.',
      },
      null,
      2,
    ),
  );
  await mongoose.disconnect();
}

main().catch(async (e) => {
  console.error('migration failed:', e);
  await mongoose.disconnect();
  process.exit(1);
});

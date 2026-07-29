/*
 * Deletes rows left behind when a user document is removed.
 *
 * Deleting a user from Mongo does not cascade, so every collection keyed by
 * that user keeps pointing at an id nothing resolves. The visible damage is
 * small but confusing — the admin invoice list renders "-" where the customer
 * name should be, and orphaned orders still count toward report totals.
 *
 * SCOPE IS DELIBERATELY NARROW. Only rows whose OWNER is gone are removed, plus
 * rows that hang off an order removed in the same pass. Two classes of
 * "orphan" are explicitly NOT touched, because deleting them destroys real
 * business records:
 *
 *   - orders whose `staff_shift_id` no longer resolves. Shifts get deleted as
 *     scheduling churn; the order — including completed, paid ones — is still
 *     a real transaction. 47 of 75 orders were in this state when this script
 *     was written.
 *   - feedbacks whose `work_order_id` no longer resolves while the order still
 *     exists. That is a real customer rating with real text.
 *
 * Guarantees:
 *   - Idempotent. A second run reports 0.
 *   - Bounded. Only the collections listed below, only for dead user ids.
 *
 * Run:
 *   pnpm exec ts-node scripts/purge-orphaned-user-data.ts --dry-run
 *   pnpm exec ts-node scripts/purge-orphaned-user-data.ts
 */
import mongoose, { Types } from 'mongoose';
import { config } from '../src/config';

const DRY_RUN = process.argv.includes('--dry-run');

/** [collection, field pointing at users._id] */
const OWNED_BY_USER: [string, string][] = [
  ['vehicles', 'customer_id'],
  ['orders', 'customer_id'],
  ['loyalty_accounts', 'customer_id'],
  ['loyalty_transactions', 'customer_id'],
  ['notifications', 'user_id'],
  ['feedbacks', 'customer_id'],
  ['vouchers', 'customer_id'],
  ['voucher_redemptions', 'customer_id'],
  ['chat_sessions', 'customer_id'],
];

/** [collection, field pointing at orders._id] — required refs, so the row dies with its order. */
const OWNED_BY_ORDER: [string, string][] = [
  ['work_orders', 'order_id'],
  ['payment_transactions', 'order_id'],
  ['feedbacks', 'order_id'],
  ['voucher_redemptions', 'order_id'],
];

/** [collection, field] — optional order refs: blank the pointer, keep the row. */
const OPTIONAL_ORDER_REFS: [string, string][] = [
  ['loyalty_transactions', 'order_id'],
  ['vouchers', 'used_order_id'],
  ['vouchers', 'reserved_order_id'],
];

async function deadUserIds(): Promise<Types.ObjectId[]> {
  const db = mongoose.connection;
  const seen = new Map<string, Types.ObjectId>();
  for (const [coll, field] of OWNED_BY_USER) {
    const ids = (await db.collection(coll).distinct(field, {
      [field]: { $nin: [null, undefined] },
    })) as Types.ObjectId[];
    for (const id of ids) seen.set(id.toString(), id);
  }
  const all = [...seen.values()];
  if (all.length === 0) return [];
  const alive = new Set(
    (
      await db
        .collection('users')
        .find({ _id: { $in: all } }, { projection: { _id: 1 } })
        .toArray()
    ).map((u) => u._id.toString()),
  );
  return all.filter((id) => !alive.has(id.toString()));
}

async function main(): Promise<void> {
  await mongoose.connect(config.database.uri, { dbName: config.database.name });
  const db = mongoose.connection;

  const dead = await deadUserIds();
  if (dead.length === 0) {
    console.log(
      JSON.stringify({ deadUsers: 0, message: 'Nothing to purge' }, null, 2),
    );
    return;
  }

  // Orders die with their owner; everything hanging off them goes too.
  const orderIds = (
    await db
      .collection('orders')
      .find({ customer_id: { $in: dead } }, { projection: { _id: 1 } })
      .toArray()
  ).map((o) => o._id);

  const deleted: Record<string, number> = {};
  const unset: Record<string, number> = {};

  for (const [coll, field] of OWNED_BY_ORDER) {
    if (orderIds.length === 0) break;
    const filter = { [field]: { $in: orderIds } };
    const n = DRY_RUN
      ? await db.collection(coll).countDocuments(filter)
      : (await db.collection(coll).deleteMany(filter)).deletedCount;
    if (n) deleted[`${coll}.${field}`] = n;
  }

  for (const [coll, field] of OPTIONAL_ORDER_REFS) {
    if (orderIds.length === 0) break;
    const filter = { [field]: { $in: orderIds } };
    const n = DRY_RUN
      ? await db.collection(coll).countDocuments(filter)
      : (
          await db
            .collection(coll)
            .updateMany(filter, { $unset: { [field]: '' } })
        ).modifiedCount;
    if (n) unset[`${coll}.${field}`] = n;
  }

  for (const [coll, field] of OWNED_BY_USER) {
    const filter = { [field]: { $in: dead } };
    const n = DRY_RUN
      ? await db.collection(coll).countDocuments(filter)
      : (await db.collection(coll).deleteMany(filter)).deletedCount;
    if (n) deleted[`${coll}.${field}`] = n;
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        deadUserIds: dead.map((d) => d.toString()),
        ordersRemoved: orderIds.length,
        deleted,
        unset,
        untouched:
          'orders with a missing staff_shift_id, and feedbacks whose work_order is gone but whose order still exists',
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error('purge failed:', e);
    process.exitCode = 1;
  })
  .finally(() => void mongoose.disconnect());

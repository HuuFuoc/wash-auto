/*
 * Re-points every loyalty_account at the tier its points_balance actually earns.
 *
 * Why this exists: `seedDefaults` used to DROP the tier_configs collection and
 * recreate it on every boot, so each restart minted new _ids and orphaned every
 * `loyalty_accounts.tier_config_id` pointing at the previous generation. The
 * seeding bug is fixed (seeding is `$setOnInsert`-only now), but the accounts
 * left behind still reference tiers from generations that no longer exist.
 *
 * Two visible symptoms this clears:
 *   - The admin dashboard's tier distribution `$lookup`s tier_configs and falls
 *     back to 'None' on a miss, so every orphaned account was counted as None.
 *   - `ensureForCustomer` used to "repair" a dangling reference by snapping the
 *     account to None, permanently DEMOTING customers who had earned Bronze or
 *     above. That code now re-derives from the balance; this script applies the
 *     same correction to accounts nobody has touched since.
 *
 * Tier rule, identical to `highestTierFor` in loyalty.service.ts: the highest
 * ACTIVE tier whose `min_loyalty_points` <= `points_balance`.
 *
 * No `tier_changed` audit rows are written. The customer's standing never
 * actually changed — the pointer did — so inventing promotion events would
 * misreport history.
 *
 * Guarantees:
 *   - Idempotent. A second run reports 0 changed.
 *   - Narrow. Only `tier_config_id` is written; points, voucher progress and
 *     lifetime counters are untouched.
 *
 * Run:
 *   pnpm exec ts-node scripts/migrate-repair-loyalty-tiers.ts --dry-run
 *   pnpm exec ts-node scripts/migrate-repair-loyalty-tiers.ts
 */
import mongoose from 'mongoose';
import { config } from '../src/config';
import { LoyaltyAccountModel } from '../src/modules/loyalty/loyalty-account.model';
import { TierConfigModel } from '../src/modules/tier-config/tier-config.model';

const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  await mongoose.connect(config.database.uri, { dbName: config.database.name });

  const tiers = await TierConfigModel.find({ is_active: true })
    .sort({ min_loyalty_points: 1 })
    .lean();
  if (tiers.length === 0) {
    throw new Error(
      'No active tier_configs — start the app once to seed them.',
    );
  }
  const aliveIds = new Set(tiers.map((t) => t._id.toString()));

  const accounts = await LoyaltyAccountModel.find({})
    .select({ _id: 1, customer_id: 1, points_balance: 1, tier_config_id: 1 })
    .lean();

  let dangling = 0;
  let changed = 0;
  const moves: Record<string, number> = {};

  for (const account of accounts) {
    const balance = account.points_balance ?? 0;
    let target = tiers[0];
    for (const t of tiers) {
      if (balance >= t.min_loyalty_points) target = t;
    }

    const storedId = account.tier_config_id?.toString();
    const wasDangling = !storedId || !aliveIds.has(storedId);
    if (wasDangling) dangling += 1;
    if (storedId === target._id.toString()) continue;

    const from = wasDangling
      ? 'DANGLING'
      : (tiers.find((t) => t._id.toString() === storedId)?.tier_name ?? '?');
    moves[`${from} -> ${target.tier_name}`] =
      (moves[`${from} -> ${target.tier_name}`] ?? 0) + 1;

    if (!DRY_RUN) {
      await LoyaltyAccountModel.updateOne(
        { _id: account._id },
        { $set: { tier_config_id: target._id } },
      );
    }
    changed += 1;
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        activeTiers: tiers.map((t) => `${t.tier_name}@${t.min_loyalty_points}`),
        scannedAccounts: accounts.length,
        danglingBefore: dangling,
        changed,
        moves,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error('migration failed:', e);
    process.exitCode = 1;
  })
  .finally(() => void mongoose.disconnect());

/*
 * Backfills every pre-campaign voucher into a real VoucherCampaign.
 *
 * Before campaigns existed, a "batch" was only a naming convention inside the
 * voucher code (`PREFIX-YYYYMMDD-NNNN`), reconstructed at read time with a
 * regex. This script is the ONE AND ONLY place that regex is allowed to run:
 * it resolves each legacy batch once and writes the answer into
 * `vouchers.campaign_id`, after which nothing in the codebase ever parses a
 * voucher code again.
 *
 * Grouping key is (batch, discount_cap_vnd) rather than batch alone. A legacy
 * campaign is FIXED_AMOUNT with `discount_value` = that cap, so every voucher it
 * adopts keeps the exact discount it had before — splitting on the cap is what
 * guarantees no voucher's value silently changes.
 *
 * Guarantees:
 *   - Idempotent. Vouchers that already have a campaign_id are skipped, and
 *     campaigns are looked up by name before being created, so re-running is a
 *     no-op.
 *   - Non-destructive. No voucher status is touched: USED stays USED, EXPIRED
 *     stays EXPIRED. Only campaign_id is written.
 *   - Backward compatible. Legacy campaigns are created with empty whitelists,
 *     min_order_vnd 0 and WITH_TIER_AND_PROMOTION stacking — exactly the rules
 *     that applied before campaigns existed.
 *
 * Run once, after deploying the Phase 2 code:
 *   pnpm exec ts-node scripts/migrate-voucher-campaigns.ts
 *
 * Dry run (reports what it would do, writes nothing):
 *   pnpm exec ts-node scripts/migrate-voucher-campaigns.ts --dry-run
 *
 * Rollback: `db.vouchers.updateMany({}, { $unset: { campaign_id: "" } })` then
 * delete the campaigns whose source is `legacy`. Vouchers keep working either
 * way because the eligibility engine falls back to legacy behaviour whenever
 * campaign_id is absent.
 */
import mongoose, { Types } from 'mongoose';
import { config } from '../src/config';
import { VoucherModel } from '../src/modules/voucher/voucher.model';
import { VoucherCampaignModel } from '../src/modules/voucher-campaign/voucher-campaign.model';
import { VoucherSourceEnum } from '../src/shared/voucher/types/voucher-source.enum';
import { BenefitTypeEnum } from '../src/shared/voucher-campaign/types/benefit-type.enum';
import { CampaignStatusEnum } from '../src/shared/voucher-campaign/types/campaign-status.enum';
import { StackingPolicyEnum } from '../src/shared/voucher-campaign/types/stacking-policy.enum';

/** Legacy bulk codes: PREFIX-YYYYMMDD-NNNN. */
const LEGACY_BATCH_CODE = /^(.+)-(\d{8})-\d{4}$/;

const DRY_RUN = process.argv.includes('--dry-run');

interface LegacyVoucher {
  _id: Types.ObjectId;
  code: string;
  discount_cap_vnd: number;
  expires_at: Date;
  created_at: Date;
}

interface Group {
  /** Stable campaign name, also the idempotency key. */
  name: string;
  title: string;
  capVnd: number;
  voucherIds: Types.ObjectId[];
  earliestCreatedAt: Date;
  latestExpiresAt: Date;
}

/**
 * Buckets a legacy voucher. Batch codes keep their prefix + date so operators
 * still recognise the promotion; everything else (loyalty rewards, one-off admin
 * grants) falls into a per-cap bucket.
 */
function groupKeyFor(v: LegacyVoucher): { key: string; title: string } {
  const match = LEGACY_BATCH_CODE.exec(v.code);
  if (match) {
    const [, prefix, day] = match;
    return {
      key: `legacy-${prefix}-${day}-${v.discount_cap_vnd}`,
      title: `${prefix} ${day} (giảm tối đa ${v.discount_cap_vnd.toLocaleString('vi-VN')}đ)`,
    };
  }
  return {
    key: `legacy-granted-${v.discount_cap_vnd}`,
    title: `Voucher cấp trực tiếp (giảm tối đa ${v.discount_cap_vnd.toLocaleString('vi-VN')}đ)`,
  };
}

async function main(): Promise<void> {
  await mongoose.connect(config.database.uri);

  const orphans = await VoucherModel.find({
    campaign_id: { $exists: false },
  })
    .select({
      _id: 1,
      code: 1,
      discount_cap_vnd: 1,
      expires_at: 1,
      created_at: 1,
    })
    .lean<LegacyVoucher[]>();

  if (orphans.length === 0) {
    console.log(
      JSON.stringify({ scanned: 0, message: 'Nothing to backfill' }, null, 2),
    );
    await mongoose.disconnect();
    return;
  }

  const groups = new Map<string, Group>();
  for (const v of orphans) {
    const { key, title } = groupKeyFor(v);
    const existing = groups.get(key);
    if (existing) {
      existing.voucherIds.push(v._id);
      if (v.created_at < existing.earliestCreatedAt) {
        existing.earliestCreatedAt = v.created_at;
      }
      if (v.expires_at > existing.latestExpiresAt) {
        existing.latestExpiresAt = v.expires_at;
      }
    } else {
      groups.set(key, {
        name: key,
        title,
        capVnd: v.discount_cap_vnd,
        voucherIds: [v._id],
        earliestCreatedAt: v.created_at,
        latestExpiresAt: v.expires_at,
      });
    }
  }

  const now = new Date();
  let campaignsCreated = 0;
  let campaignsReused = 0;
  let vouchersLinked = 0;

  for (const group of groups.values()) {
    let campaign = await VoucherCampaignModel.findOne({ name: group.name });

    if (campaign) {
      campaignsReused += 1;
    } else if (DRY_RUN) {
      campaignsCreated += 1;
    } else {
      campaign = await VoucherCampaignModel.create({
        name: group.name,
        title: group.title,
        description:
          'Chiến dịch được tạo tự động khi chuyển voucher cũ sang mô hình campaign.',
        // A batch whose vouchers have all expired becomes ENDED; anything still
        // redeemable stays ACTIVE so live vouchers keep working unchanged.
        status:
          group.latestExpiresAt > now
            ? CampaignStatusEnum.ACTIVE
            : CampaignStatusEnum.ENDED,
        benefit_type: BenefitTypeEnum.FIXED_AMOUNT,
        discount_value: group.capVnd,
        min_order_vnd: 0,
        valid_from: group.earliestCreatedAt,
        valid_until: group.latestExpiresAt,
        // Pre-campaign vouchers always stacked on top of golden hour and tier.
        stacking_policy: StackingPolicyEnum.WITH_TIER_AND_PROMOTION,
        max_uses_per_customer: group.voucherIds.length,
        source: VoucherSourceEnum.LEGACY,
        allowed_tier_ids: [],
        applicable_service_type_ids: [],
        applicable_vehicle_type_ids: [],
      });
      campaignsCreated += 1;
    }

    if (DRY_RUN) {
      vouchersLinked += group.voucherIds.length;
      continue;
    }

    const res = await VoucherModel.updateMany(
      // The campaign_id guard is what makes a re-run harmless: a voucher linked
      // by an earlier pass no longer matches.
      { _id: { $in: group.voucherIds }, campaign_id: { $exists: false } },
      { $set: { campaign_id: campaign!._id } },
    );
    vouchersLinked += res.modifiedCount ?? 0;
  }

  console.log(
    JSON.stringify(
      {
        dryRun: DRY_RUN,
        scannedVouchers: orphans.length,
        groups: groups.size,
        campaignsCreated,
        campaignsReused,
        vouchersLinked,
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

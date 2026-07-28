import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { VoucherSourceEnum } from '../../shared/voucher/types/voucher-source.enum';
import { BenefitTypeEnum } from '../../shared/voucher-campaign/types/benefit-type.enum';
import { CampaignStatusEnum } from '../../shared/voucher-campaign/types/campaign-status.enum';
import { StackingPolicyEnum } from '../../shared/voucher-campaign/types/stacking-policy.enum';

/**
 * A voucher campaign: the rules every voucher minted under it inherits.
 *
 * Replaces the old "batch", which existed only as a naming convention inside the
 * voucher code (`PREFIX-YYYYMMDD-NNNN` parsed with a regex). Campaign membership
 * is now a real foreign key, so renaming a code cannot silently move a voucher
 * into another promotion.
 *
 * Eligibility is stored as ObjectId arrays rather than join tables — this is
 * MongoDB, and the lists are small, bounded, and always read whole alongside the
 * campaign. They are NEVER comma-joined strings, and never matched by regex.
 * An EMPTY array means "applies to everything"; a non-empty one is a whitelist.
 */
export interface VoucherCampaign {
  /** Internal name for operators. Not shown to customers. */
  name: string;

  // ─── customer-facing presentation ──────────────────────────────────────────
  title: string;
  description?: string;
  terms?: string;
  image_url?: string;
  /** Hex colour the app themes the voucher card with, e.g. `#E4572E`. */
  theme_color?: string;

  status: CampaignStatusEnum;

  // ─── benefit ───────────────────────────────────────────────────────────────
  benefit_type: BenefitTypeEnum;
  /**
   * VND for FIXED_AMOUNT, percent (1-100) for PERCENT_OFF. Ignored by
   * FREE_SERVICE, which always covers the whole eligible service.
   */
  discount_value: number;
  /** Ceiling in VND. Meaningful for PERCENT_OFF; null = uncapped. */
  discount_cap_vnd?: number;
  /** Order subtotal required before the voucher applies at all. */
  min_order_vnd: number;

  // ─── validity ──────────────────────────────────────────────────────────────
  valid_from: Date;
  valid_until: Date;

  stacking_policy: StackingPolicyEnum;

  // ─── limits ────────────────────────────────────────────────────────────────
  /** Total vouchers this campaign may ever issue. Null = unlimited. */
  max_uses_total?: number;
  /** Vouchers one customer may hold from this campaign. */
  max_uses_per_customer: number;
  /** Total VND of discount the campaign may give away. Null = unbudgeted. */
  budget_vnd?: number;

  source: VoucherSourceEnum;

  /**
   * Code customers type to claim from this campaign's pool. Unique when set;
   * campaigns that only grant directly (loyalty, birthday) leave it null.
   */
  public_claim_code?: string;

  // ─── eligibility whitelists (empty = no restriction) ───────────────────────
  allowed_tier_ids: Types.ObjectId[];
  applicable_service_type_ids: Types.ObjectId[];
  applicable_vehicle_type_ids: Types.ObjectId[];

  created_by?: Types.ObjectId;

  // ─── cached counters ───────────────────────────────────────────────────────
  /**
   * Running totals maintained with atomic `$inc` so the budget gate is one
   * field read instead of an aggregation on every pricing call.
   *
   * These are an OPTIMISATION, not the source of truth: `voucher_redemptions`
   * is. `VoucherCampaignService.reconcileCounters` recomputes them from those
   * rows, so a counter that drifts (crash between the write and the `$inc`,
   * manual data surgery) is always recoverable.
   */
  redeemed_count: number;
  redeemed_vnd: number;
}

export type VoucherCampaignDocument = HydratedDocument<VoucherCampaign>;

const voucherCampaignSchema = new Schema<VoucherCampaign>(
  {
    name: { type: String, required: true, trim: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    terms: { type: String, trim: true },
    image_url: { type: String, trim: true },
    theme_color: { type: String, trim: true },

    status: {
      type: String,
      required: true,
      enum: Object.values(CampaignStatusEnum),
      default: CampaignStatusEnum.DRAFT,
      index: true,
    },

    benefit_type: {
      type: String,
      required: true,
      enum: Object.values(BenefitTypeEnum),
    },
    discount_value: { type: Number, required: true, min: 0 },
    discount_cap_vnd: { type: Number, min: 1 },
    min_order_vnd: { type: Number, required: true, default: 0, min: 0 },

    valid_from: { type: Date, required: true },
    valid_until: { type: Date, required: true },

    stacking_policy: {
      type: String,
      required: true,
      enum: Object.values(StackingPolicyEnum),
      default: StackingPolicyEnum.WITH_TIER_AND_PROMOTION,
    },

    max_uses_total: { type: Number, min: 1 },
    max_uses_per_customer: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    budget_vnd: { type: Number, min: 1 },

    source: {
      type: String,
      required: true,
      enum: Object.values(VoucherSourceEnum),
      default: VoucherSourceEnum.CAMPAIGN,
      index: true,
    },

    public_claim_code: {
      type: String,
      trim: true,
      uppercase: true,
      unique: true,
      sparse: true,
    },

    allowed_tier_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: 'TierConfig' }],
      default: [],
    },
    applicable_service_type_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: 'ServiceType' }],
      default: [],
    },
    applicable_vehicle_type_ids: {
      type: [{ type: Schema.Types.ObjectId, ref: 'VehicleType' }],
      default: [],
    },

    created_by: { type: Schema.Types.ObjectId, ref: 'User' },

    redeemed_count: { type: Number, required: true, default: 0, min: 0 },
    redeemed_vnd: { type: Number, required: true, default: 0, min: 0 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'voucher_campaigns',
  },
);

// "Which campaigns are live right now?" — the activation sweep and the admin
// list both filter on status plus the validity window.
voucherCampaignSchema.index({ status: 1, valid_from: 1, valid_until: 1 });

export const VoucherCampaignModel = model<VoucherCampaign>(
  'VoucherCampaign',
  voucherCampaignSchema,
);

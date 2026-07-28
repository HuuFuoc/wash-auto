import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions';
import { CreateVoucherCampaignDto } from '../../shared/voucher-campaign/dto/create-voucher-campaign.dto';
import { UpdateVoucherCampaignDto } from '../../shared/voucher-campaign/dto/update-voucher-campaign.dto';
import {
  VoucherCampaignListResponseDto,
  VoucherCampaignResponseDto,
} from '../../shared/voucher-campaign/dto/voucher-campaign-response.dto';
import { VoucherSourceEnum } from '../../shared/voucher/types/voucher-source.enum';
import { BenefitTypeEnum } from '../../shared/voucher-campaign/types/benefit-type.enum';
import { CampaignStatusEnum } from '../../shared/voucher-campaign/types/campaign-status.enum';
import { StackingPolicyEnum } from '../../shared/voucher-campaign/types/stacking-policy.enum';
import {
  VoucherCampaign,
  VoucherCampaignDocument,
} from './voucher-campaign.model';
import { CampaignStatsResponseDto } from '../../shared/voucher-campaign/dto/campaign-stats-response.dto';
import { VoucherCampaignPublicDto } from '../../shared/voucher-campaign/dto/voucher-campaign-public.dto';
import { VoucherRedemptionRepository } from '../voucher/voucher-redemption.repository';
import { VoucherRepository } from '../voucher/voucher.repository';
import {
  ICampaignListFilter,
  VoucherCampaignRepository,
} from './voucher-campaign.repository';

/** The campaign shape the coherence rules are checked against. */
type CampaignRules = Pick<
  VoucherCampaign,
  | 'benefit_type'
  | 'discount_value'
  | 'discount_cap_vnd'
  | 'min_order_vnd'
  | 'valid_from'
  | 'valid_until'
  | 'max_uses_total'
  | 'max_uses_per_customer'
  | 'budget_vnd'
  | 'applicable_service_type_ids'
>;

export class VoucherCampaignService {
  constructor(
    private readonly repository: VoucherCampaignRepository,
    private readonly voucherRepository: VoucherRepository,
    private readonly redemptionRepository: VoucherRedemptionRepository,
  ) {}

  async create(
    dto: CreateVoucherCampaignDto,
    createdBy?: string,
  ): Promise<VoucherCampaignResponseDto> {
    if (await this.repository.findByName(dto.name)) {
      throw new ConflictException(`Campaign "${dto.name}" đã tồn tại`);
    }
    if (
      dto.publicClaimCode &&
      (await this.repository.findByPublicClaimCode(dto.publicClaimCode))
    ) {
      throw new ConflictException(
        `Mã claim "${dto.publicClaimCode}" đã được chiến dịch khác dùng`,
      );
    }

    const fields = toColumns(dto);
    assertCoherent(fields);

    const doc = await this.repository.create({
      // Whitelists default to empty, which the eligibility rules read as
      // "applies to everything".
      allowed_tier_ids: [],
      applicable_service_type_ids: [],
      applicable_vehicle_type_ids: [],
      ...fields,
      benefit_type: dto.benefitType,
      discount_value: dto.discountValue ?? 0,
      min_order_vnd: fields.min_order_vnd ?? 0,
      max_uses_per_customer: fields.max_uses_per_customer ?? 1,
      valid_from: dto.validFrom,
      valid_until: dto.validUntil,
      name: dto.name,
      title: dto.title,
      description: dto.description,
      terms: dto.terms,
      image_url: dto.imageUrl,
      theme_color: dto.themeColor,
      stacking_policy:
        dto.stackingPolicy ?? StackingPolicyEnum.WITH_TIER_AND_PROMOTION,
      source: dto.source ?? VoucherSourceEnum.CAMPAIGN,
      public_claim_code: dto.publicClaimCode,
      created_by: createdBy ? new Types.ObjectId(createdBy) : undefined,
      status: CampaignStatusEnum.DRAFT,
    });
    console.log(
      `campaign.created id=${doc._id.toString()} name=${doc.name} by=${createdBy ?? 'unknown'}`,
    );
    return VoucherCampaignResponseDto.fromDocument(doc);
  }

  async update(
    id: string,
    dto: UpdateVoucherCampaignDto,
  ): Promise<VoucherCampaignResponseDto> {
    const existing = await this.requireCampaign(id);
    if (existing.status === CampaignStatusEnum.ENDED) {
      throw new ConflictException(
        'Chiến dịch đã kết thúc, không sửa được. Hãy tạo chiến dịch mới.',
      );
    }
    if (dto.publicClaimCode) {
      const clash = await this.repository.findByPublicClaimCode(
        dto.publicClaimCode,
      );
      if (clash && !clash._id.equals(existing._id)) {
        throw new ConflictException(
          `Mã claim "${dto.publicClaimCode}" đã được chiến dịch khác dùng`,
        );
      }
    }

    const patch = toColumns(dto);
    // Coherence is judged on the MERGED result: a patch that only flips
    // benefitType to percent_off must be rejected if the stored discountValue
    // is still a VND figure like 50000.
    assertCoherent({
      benefit_type: patch.benefit_type ?? existing.benefit_type,
      discount_value: patch.discount_value ?? existing.discount_value,
      discount_cap_vnd: patch.discount_cap_vnd ?? existing.discount_cap_vnd,
      min_order_vnd: patch.min_order_vnd ?? existing.min_order_vnd,
      valid_from: patch.valid_from ?? existing.valid_from,
      valid_until: patch.valid_until ?? existing.valid_until,
      max_uses_total: patch.max_uses_total ?? existing.max_uses_total,
      max_uses_per_customer:
        patch.max_uses_per_customer ?? existing.max_uses_per_customer,
      budget_vnd: patch.budget_vnd ?? existing.budget_vnd,
      applicable_service_type_ids:
        patch.applicable_service_type_ids ??
        existing.applicable_service_type_ids,
    });

    const updated = await this.repository.update(id, {
      ...patch,
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined
        ? { description: dto.description }
        : {}),
      ...(dto.terms !== undefined ? { terms: dto.terms } : {}),
      ...(dto.imageUrl !== undefined ? { image_url: dto.imageUrl } : {}),
      ...(dto.themeColor !== undefined ? { theme_color: dto.themeColor } : {}),
      ...(dto.stackingPolicy !== undefined
        ? { stacking_policy: dto.stackingPolicy }
        : {}),
      ...(dto.publicClaimCode !== undefined
        ? { public_claim_code: dto.publicClaimCode }
        : {}),
    });
    if (!updated) throw new NotFoundException('Campaign not found');
    return VoucherCampaignResponseDto.fromDocument(updated);
  }

  async getById(id: string): Promise<VoucherCampaignResponseDto> {
    return VoucherCampaignResponseDto.fromDocument(
      await this.requireCampaign(id),
    );
  }

  /**
   * Customer-facing view. Returns the safe projection — no budget, no spend
   * counters, no issue limit, no claim code.
   *
   * A DRAFT campaign is treated as non-existent: it is still being written, so
   * exposing its copy would leak an unannounced promotion to anyone who guessed
   * the id.
   */
  async getPublicById(id: string): Promise<VoucherCampaignPublicDto> {
    const campaign = await this.requireCampaign(id);
    if (campaign.status === CampaignStatusEnum.DRAFT) {
      throw new NotFoundException('Campaign not found');
    }
    return VoucherCampaignPublicDto.fromDocument(campaign);
  }

  async list(
    filter: ICampaignListFilter,
    page: number,
    limit: number,
  ): Promise<VoucherCampaignListResponseDto> {
    const [docs, total] = await Promise.all([
      this.repository.findPaginated(filter, page, limit),
      this.repository.count(filter),
    ]);
    return {
      data: docs.map((d) => VoucherCampaignResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  // ---------- lifecycle ----------

  /**
   * DRAFT/PAUSED → ACTIVE, or → SCHEDULED when the start date is still ahead.
   * Activating something already finished is refused rather than silently
   * resurrecting a campaign whose budget was spent.
   */
  async activate(id: string): Promise<VoucherCampaignResponseDto> {
    const campaign = await this.requireCampaign(id);
    const now = Date.now();
    if (campaign.valid_until.getTime() <= now) {
      throw new ConflictException(
        'Chiến dịch đã qua ngày kết thúc, không kích hoạt được.',
      );
    }
    const next =
      campaign.valid_from.getTime() > now
        ? CampaignStatusEnum.SCHEDULED
        : CampaignStatusEnum.ACTIVE;
    return this.transition(
      id,
      [
        CampaignStatusEnum.DRAFT,
        CampaignStatusEnum.SCHEDULED,
        CampaignStatusEnum.PAUSED,
      ],
      next,
    );
  }

  async pause(id: string): Promise<VoucherCampaignResponseDto> {
    return this.transition(
      id,
      [CampaignStatusEnum.ACTIVE, CampaignStatusEnum.SCHEDULED],
      CampaignStatusEnum.PAUSED,
    );
  }

  /**
   * Ends a campaign. Terminal by design — the campaign row and its vouchers are
   * history that reports read, so it is never deleted. Existing vouchers stop
   * being redeemable because eligibility requires an ACTIVE campaign.
   */
  async end(id: string): Promise<VoucherCampaignResponseDto> {
    return this.transition(
      id,
      [
        CampaignStatusEnum.DRAFT,
        CampaignStatusEnum.SCHEDULED,
        CampaignStatusEnum.ACTIVE,
        CampaignStatusEnum.PAUSED,
      ],
      CampaignStatusEnum.ENDED,
    );
  }

  // ---------- statistics ----------

  /**
   * Performance of one campaign. Voucher counts come from the vouchers
   * themselves and money from the redemption records, so every figure is
   * derived from primary data rather than from the cached counters.
   */
  async stats(id: string): Promise<CampaignStatsResponseDto> {
    const campaign = await this.requireCampaign(id);
    const [vouchers, totals] = await Promise.all([
      this.voucherRepository.aggregateStatsForCampaign(campaign._id),
      this.redemptionRepository.totalsForCampaign(campaign._id),
    ]);

    const issued = vouchers.total;
    const claimed =
      vouchers.claimed + vouchers.reserved + vouchers.used + vouchers.expired;
    const budgetUsedVnd = totals.discountVnd;

    return {
      campaignId: campaign._id.toString(),
      name: campaign.name,
      status: campaign.status,
      issued,
      claimed,
      inPool: vouchers.inPool,
      reserved: vouchers.reserved,
      used: vouchers.used,
      expired: vouchers.expired,
      revoked: vouchers.revoked,
      // Of everything handed to a customer, how much came back redeemed.
      redemptionRatePercent: percent(vouchers.used, claimed),
      totalDiscountVnd: budgetUsedVnd,
      budgetVnd: campaign.budget_vnd,
      budgetUsedVnd,
      budgetRemainingVnd:
        campaign.budget_vnd != null
          ? Math.max(0, campaign.budget_vnd - budgetUsedVnd)
          : undefined,
      usageLimitRemaining:
        campaign.max_uses_total != null
          ? Math.max(0, campaign.max_uses_total - issued)
          : undefined,
      averageOrderBeforeDiscountVnd: average(
        totals.originalVnd,
        totals.appliedCount,
      ),
      averageOrderAfterDiscountVnd: average(
        totals.finalVnd,
        totals.appliedCount,
      ),
      // Surfaced so operators can see the cached counter drifting before it
      // matters; `campaign-reconcile` repairs it.
      cachedRedeemedVnd: campaign.redeemed_vnd,
      countersInSync:
        campaign.redeemed_vnd === totals.discountVnd &&
        campaign.redeemed_count === totals.appliedCount,
    };
  }

  /**
   * Recomputes every campaign's cached counters from the redemption records.
   * Idempotent — it writes absolute values rather than deltas, so running it
   * twice produces the same result as running it once.
   */
  async reconcileAllCounters(): Promise<{ checked: number; repaired: number }> {
    const campaigns = await this.repository.findAll();
    let repaired = 0;
    for (const campaign of campaigns) {
      const totals = await this.redemptionRepository.totalsForCampaign(
        campaign._id,
      );
      if (
        campaign.redeemed_count === totals.appliedCount &&
        campaign.redeemed_vnd === totals.discountVnd
      ) {
        continue;
      }
      await this.repository.setRedeemedCounters(
        campaign._id,
        totals.appliedCount,
        totals.discountVnd,
      );
      repaired += 1;
      console.warn(
        `campaign.counters_repaired id=${campaign._id.toString()} ` +
          `count ${campaign.redeemed_count}→${totals.appliedCount} ` +
          `vnd ${campaign.redeemed_vnd}→${totals.discountVnd}`,
      );
    }
    return { checked: campaigns.length, repaired };
  }

  /** Cron entrypoint: start scheduled campaigns, retire finished ones. */
  async sweepLifecycle(): Promise<{ started: number; ended: number }> {
    const result = await this.repository.sweepLifecycle(new Date());
    if (result.started > 0 || result.ended > 0) {
      console.log(
        `campaign.lifecycle_swept started=${result.started} ended=${result.ended}`,
      );
    }
    return result;
  }

  private async transition(
    id: string,
    allowedFrom: CampaignStatusEnum[],
    next: CampaignStatusEnum,
  ): Promise<VoucherCampaignResponseDto> {
    const current = await this.requireCampaign(id);
    if (current.status === next) {
      return VoucherCampaignResponseDto.fromDocument(current);
    }
    const moved = await this.repository.transitionStatus(id, allowedFrom, next);
    if (!moved) {
      throw new ConflictException(
        `Không chuyển được chiến dịch từ ${current.status} sang ${next}`,
      );
    }
    console.log(`campaign.status id=${id} ${current.status} → ${next}`);
    return VoucherCampaignResponseDto.fromDocument(moved);
  }

  private async requireCampaign(id: string): Promise<VoucherCampaignDocument> {
    const doc = await this.repository.findById(id);
    if (!doc) throw new NotFoundException('Campaign not found');
    return doc;
  }
}

/** Rounded percentage, guarding the empty-denominator case. */
function percent(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** Rounded mean in whole VND, guarding the empty-denominator case. */
function average(total: number, count: number): number {
  return count > 0 ? Math.round(total / count) : 0;
}

/** Maps the camelCase DTO onto the snake_case columns, skipping absent keys. */
function toColumns(
  dto: CreateVoucherCampaignDto | UpdateVoucherCampaignDto,
): Partial<VoucherCampaign> {
  const out: Partial<VoucherCampaign> = {};
  if (dto.benefitType !== undefined) out.benefit_type = dto.benefitType;
  if (dto.discountValue !== undefined) out.discount_value = dto.discountValue;
  if (dto.discountCapVnd !== undefined) {
    out.discount_cap_vnd = dto.discountCapVnd;
  }
  if (dto.minOrderVnd !== undefined) out.min_order_vnd = dto.minOrderVnd;
  if (dto.validFrom !== undefined) out.valid_from = dto.validFrom;
  if (dto.validUntil !== undefined) out.valid_until = dto.validUntil;
  if (dto.maxUsesTotal !== undefined) out.max_uses_total = dto.maxUsesTotal;
  if (dto.maxUsesPerCustomer !== undefined) {
    out.max_uses_per_customer = dto.maxUsesPerCustomer;
  }
  if (dto.budgetVnd !== undefined) out.budget_vnd = dto.budgetVnd;
  if (dto.applicableServiceTypeIds !== undefined) {
    out.applicable_service_type_ids = dto.applicableServiceTypeIds.map(
      (id) => new Types.ObjectId(id),
    );
  }
  if (dto.allowedTierIds !== undefined) {
    out.allowed_tier_ids = dto.allowedTierIds.map(
      (id) => new Types.ObjectId(id),
    );
  }
  if (dto.applicableVehicleTypeIds !== undefined) {
    out.applicable_vehicle_type_ids = dto.applicableVehicleTypeIds.map(
      (id) => new Types.ObjectId(id),
    );
  }
  // Defaults so a freshly created campaign always has concrete values.
  if (out.min_order_vnd === undefined) out.min_order_vnd = 0;
  if (out.max_uses_per_customer === undefined) out.max_uses_per_customer = 1;
  return out;
}

/**
 * Cross-field rules class-validator cannot express on its own. Shared by create
 * and update so a campaign can never be edited into a state it could not have
 * been created in.
 */
function assertCoherent(rules: Partial<CampaignRules>): void {
  const {
    benefit_type,
    discount_value,
    discount_cap_vnd,
    valid_from,
    valid_until,
    applicable_service_type_ids,
  } = rules;

  if (
    valid_from &&
    valid_until &&
    valid_from.getTime() >= valid_until.getTime()
  ) {
    throw new BadRequestException('validFrom phải trước validUntil');
  }

  switch (benefit_type) {
    case BenefitTypeEnum.FIXED_AMOUNT:
      if (!discount_value || discount_value <= 0) {
        throw new BadRequestException(
          'fixed_amount: discountValue phải lớn hơn 0',
        );
      }
      break;

    case BenefitTypeEnum.PERCENT_OFF:
      if (!discount_value || discount_value <= 0 || discount_value > 100) {
        throw new BadRequestException(
          'percent_off: discountValue phải trong khoảng 1-100',
        );
      }
      break;

    case BenefitTypeEnum.FREE_SERVICE:
      // Without a whitelist this would hand out any service for free, including
      // the most expensive detailing package — almost never the intent.
      if (
        !applicable_service_type_ids ||
        applicable_service_type_ids.length === 0
      ) {
        throw new BadRequestException(
          'free_service: phải chọn ít nhất một dịch vụ được áp dụng ' +
            '(applicableServiceTypeIds)',
        );
      }
      break;

    default:
      break;
  }

  if (
    benefit_type !== BenefitTypeEnum.PERCENT_OFF &&
    discount_cap_vnd !== undefined
  ) {
    throw new BadRequestException(
      'discountCapVnd chỉ dùng cho benefitType = percent_off',
    );
  }
}

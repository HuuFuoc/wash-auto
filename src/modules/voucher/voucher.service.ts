import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions';
import {
  generateVoucherCode,
  maskVoucherCode,
  normalizeVoucherCode,
} from '../../common/voucher-code';
import { withTransaction } from '../../common/with-transaction';
import { DiscountBreakdownDto } from '../../shared/pricing/dto/discount-breakdown.dto';
import { RedemptionStatusEnum } from '../../shared/voucher/types/redemption-status.enum';
import { BulkCreateVoucherDto } from '../../shared/voucher/dto/bulk-create-voucher.dto';
import { GrantVoucherAdminDto } from '../../shared/voucher/dto/grant-voucher-admin.dto';
import { QueryVoucherDto } from '../../shared/voucher/dto/query-voucher.dto';
import { VoucherListResponseDto } from '../../shared/voucher/dto/voucher-list-response.dto';
import { VoucherResponseDto } from '../../shared/voucher/dto/voucher-response.dto';
import { VoucherSourceEnum } from '../../shared/voucher/types/voucher-source.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { VoucherTypeEnum } from '../../shared/voucher/types/voucher-type.enum';
import { CampaignStatusEnum } from '../../shared/voucher-campaign/types/campaign-status.enum';
import { NotificationTypeEnum } from '../../shared/notification/types/notification-type.enum';
import { notificationService } from '../notification/notification.router';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { LoyaltyAccountRepository } from '../loyalty/loyalty-account.repository';
import { VoucherCampaignDocument } from '../voucher-campaign/voucher-campaign.model';
import { VoucherCampaignRepository } from '../voucher-campaign/voucher-campaign.repository';
import { VoucherRedemptionDocument } from './voucher-redemption.model';
import { VoucherRedemptionRepository } from './voucher-redemption.repository';
import { VoucherDocument } from './voucher.model';
import { VoucherRepository } from './voucher.repository';

/** Everything needed to put a voucher on hold and freeze its breakdown. */
export interface IReserveVoucherInput {
  voucherId: string;
  customerId: string;
  orderId: Types.ObjectId;
  /** When the hold lapses if the order has not settled by then. */
  reservedUntil: Date;
  breakdown: DiscountBreakdownDto;
}

export interface IGrantFreeWashInput {
  customerId: Types.ObjectId;
  expiresAt?: Date;
  discountCapVnd?: number;
  code?: string;
  /** Acquisition channel. Defaults to ADMIN_GRANT — the manual-grant path. */
  source?: VoucherSourceEnum;
  /** Human-readable "why". Persisted at mint time, not only on revoke. */
  reason?: string;
}

// Hard ceiling on what a free-wash voucher can knock off a single order.
const DEFAULT_FREE_WASH_CAP_VND = 100_000;

// Customers have 90 days from mint to redeem.
const DEFAULT_VOUCHER_TTL_DAYS = 90;

// Random codes can theoretically collide with an existing row. The unique index
// is the authority; we simply redraw a few times before giving up.
const CODE_COLLISION_RETRIES = 5;

/**
 * Fallback `granted_reason` per channel. Callers that know more (the loyalty
 * milestone, an admin's typed note) pass their own; this only guarantees the
 * column is never empty, which is what made grant history unauditable before.
 */
const DEFAULT_GRANT_REASON: Record<VoucherSourceEnum, string> = {
  [VoucherSourceEnum.LOYALTY_MILESTONE]: 'Thưởng mốc tích lũy lượt rửa',
  [VoucherSourceEnum.ADMIN_GRANT]: 'Quản trị viên cấp thủ công',
  [VoucherSourceEnum.CAMPAIGN]: 'Phát hành theo chiến dịch',
  [VoucherSourceEnum.BIRTHDAY]: 'Quà sinh nhật',
  [VoucherSourceEnum.REFERRAL]: 'Thưởng giới thiệu bạn bè',
  [VoucherSourceEnum.WINBACK]: 'Ưu đãi mời khách quay lại',
  [VoucherSourceEnum.LEGACY]: 'Dữ liệu cũ trước khi ghi nhận nguồn cấp',
};

/**
 * Refuses a claim once the campaign has given away its budget.
 *
 * Read from the cached `redeemed_vnd` counter, exactly as
 * `VoucherEligibilityService` does at checkout — handing out a voucher the
 * pricing engine would then refuse is worse than saying no now. The counter is
 * reconcilable from voucher_redemptions, so drift is repairable without this
 * gate ever having failed open.
 */
function assertBudgetRemaining(campaign: VoucherCampaignDocument): void {
  if (
    campaign.budget_vnd != null &&
    campaign.redeemed_vnd >= campaign.budget_vnd
  ) {
    throw new ConflictException(
      'Chương trình đã dùng hết ngân sách ưu đãi. Bạn quay lại vào đợt sau nhé.',
    );
  }
}

/** True for a MongoDB unique-index violation (E11000), whatever wrapped it. */
function isDuplicateKeyError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /E11000|duplicate key/i.test(msg);
}

/** `dd/mm/yyyy` in Vietnam time — how a customer reads a deadline. */
function formatVnDate(date: Date): string {
  return date.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
}

// Business logic copied verbatim from features/voucher/voucher.service.ts; only
// DI (UserRepository / RoleRepository) + Nest exceptions + Logger were swapped
// out. Code generation no longer needs Redis: codes come from a CSPRNG rather
// than a daily INCR sequence.
export class VoucherService {
  constructor(
    private readonly repository: VoucherRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly campaignRepository: VoucherCampaignRepository,
    private readonly redemptionRepository: VoucherRedemptionRepository,
    // The loyalty REPOSITORY, not LoyaltyService: loyalty already depends on
    // this service, so only the data-access direction can be taken without
    // closing the cycle. Used solely to resolve a customer's tier for the
    // `allowed_tier_ids` gate.
    private readonly loyaltyAccountRepository: LoyaltyAccountRepository,
  ) {}

  /**
   * Mints a single FREE_WASH voucher with a fresh daily-sequential code.
   * Called by LoyaltyService when the 10-wash threshold trips.
   */
  async grantFreeWash(input: IGrantFreeWashInput): Promise<VoucherDocument> {
    const expiresAt =
      input.expiresAt ??
      new Date(Date.now() + DEFAULT_VOUCHER_TTL_DAYS * 24 * 60 * 60 * 1000);
    const discountCapVnd = input.discountCapVnd ?? DEFAULT_FREE_WASH_CAP_VND;
    const source = input.source ?? VoucherSourceEnum.ADMIN_GRANT;
    const reason = input.reason ?? DEFAULT_GRANT_REASON[source];

    // An admin-supplied code is taken literally: reject a duplicate loudly
    // rather than silently minting a different one.
    if (input.code) {
      const code = normalizeVoucherCode(input.code);
      if (await this.repository.findByCode(code)) {
        throw new ConflictException(`Mã voucher "${code}" đã tồn tại`);
      }
      return this.persistGrant({
        customerId: input.customerId,
        code,
        discountCapVnd,
        expiresAt,
        source,
        reason,
      });
    }

    // Generated code: redraw on the (vanishingly rare) unique-index collision.
    for (let attempt = 1; ; attempt++) {
      try {
        return await this.persistGrant({
          customerId: input.customerId,
          code: generateVoucherCode(),
          discountCapVnd,
          expiresAt,
          source,
          reason,
        });
      } catch (err) {
        if (!isDuplicateKeyError(err) || attempt >= CODE_COLLISION_RETRIES) {
          throw err;
        }
        console.warn(`Voucher code collision, redrawing (attempt ${attempt})`);
      }
    }
  }

  /** Writes one granted voucher and logs it with the code masked. */
  private async persistGrant(input: {
    customerId: Types.ObjectId;
    code: string;
    discountCapVnd: number;
    expiresAt: Date;
    source: VoucherSourceEnum;
    reason: string;
  }): Promise<VoucherDocument> {
    const voucher = await this.repository.create({
      customerId: input.customerId,
      code: input.code,
      type: VoucherTypeEnum.FREE_WASH,
      discountCapVnd: input.discountCapVnd,
      expiresAt: input.expiresAt,
      grantedSource: input.source,
      grantedReason: input.reason,
    });
    console.log(
      `voucher.granted code=${maskVoucherCode(voucher.code)} source=${input.source} ` +
        `cap=${input.discountCapVnd} expires=${input.expiresAt.toISOString()} ` +
        `customer=${input.customerId.toString()}`,
    );
    // Loyalty milestones announce themselves with their own richer copy, so
    // only the other channels get the generic "you received a voucher" note.
    if (input.source !== VoucherSourceEnum.LOYALTY_MILESTONE) {
      void this.notifyOnce(
        input.customerId.toString(),
        `granted:${voucher._id.toString()}`,
        {
          type: NotificationTypeEnum.VOUCHER_GRANTED,
          title: '🎁 Bạn có voucher mới',
          body:
            `Voucher giảm tới ${input.discountCapVnd.toLocaleString('vi-VN')}đ, ` +
            `dùng trước ${formatVnDate(input.expiresAt)}. ${input.reason}`,
          data: { voucherId: voucher._id.toString(), source: input.source },
        },
      );
    }
    return voucher;
  }

  async listForCustomer(
    customerId: string,
    status?: VoucherStatusEnum,
  ): Promise<VoucherResponseDto[]> {
    const docs = await this.repository.findByOwner(customerId, status);
    const campaigns = await this.loadCampaigns(docs);
    return docs.map((d) =>
      VoucherResponseDto.fromDocument(
        d,
        undefined,
        campaigns.get(d.campaign_id?.toString() ?? ''),
      ),
    );
  }

  async getForCustomer(
    customerId: string,
    id: string,
  ): Promise<VoucherResponseDto> {
    const doc = await this.repository.findByIdForOwner(id, customerId);
    if (!doc) throw new NotFoundException('Voucher not found');
    const campaign = doc.campaign_id
      ? await this.campaignRepository.findById(doc.campaign_id)
      : null;
    return VoucherResponseDto.fromDocument(doc, undefined, campaign);
  }

  /**
   * Fetches every campaign referenced by `docs` in ONE query, keyed by id.
   *
   * A wallet screen renders a card per voucher, each needing its campaign's
   * title/image/terms. Resolving those one at a time would be a request per
   * voucher; this keeps it at one regardless of wallet size.
   */
  private async loadCampaigns(
    docs: VoucherDocument[],
  ): Promise<Map<string, VoucherCampaignDocument>> {
    const ids = [
      ...new Set(
        docs
          .map((d) => d.campaign_id?.toString())
          .filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) return new Map();
    const campaigns = await this.campaignRepository.findByIds(ids);
    return new Map(campaigns.map((c) => [c._id.toString(), c]));
  }

  /**
   * Puts a voucher on hold for one order and opens a redemption record with the
   * price breakdown frozen at this moment.
   *
   * The voucher is NOT spent here — that is the whole point. An online order
   * sits in PENDING_PAYMENT until the customer pays, and burning the voucher at
   * booking time (which is what the old code did) meant an abandoned checkout
   * destroyed it.
   *
   * Two guards, both at the database rather than in application logic:
   *   - the CAS on the voucher row, which only one order can win, and
   *   - the unique index on `active_voucher_id`, which rejects a second live
   *     redemption for the same voucher with E11000.
   */
  async reserveForOrder(input: IReserveVoucherInput): Promise<VoucherDocument> {
    return withTransaction(async (session) => {
      const reserved = await this.repository.reserve(
        input.voucherId,
        input.customerId,
        input.orderId,
        input.reservedUntil,
        session,
      );
      if (!reserved) {
        throw new ConflictException(
          'Voucher không còn khả dụng (đã được dùng hoặc đang giữ cho đơn khác)',
        );
      }
      if (reserved.type !== VoucherTypeEnum.FREE_WASH) {
        throw new NotFoundException('Voucher is not redeemable for a wash');
      }

      try {
        await this.redemptionRepository.createReserved(
          {
            voucherId: reserved._id,
            campaignId: reserved.campaign_id,
            customerId: new Types.ObjectId(input.customerId),
            orderId: input.orderId,
            originalOrderVnd: input.breakdown.subtotalVnd,
            eligibleAmountVnd: input.breakdown.eligibleAmountVnd,
            promotionDiscountVnd: input.breakdown.promotionDiscountVnd,
            tierDiscountVnd: input.breakdown.tierDiscountVnd,
            voucherDiscountVnd: input.breakdown.voucherDiscountVnd,
            finalOrderVnd: input.breakdown.finalTotalVnd,
            reservedUntil: input.reservedUntil,
          },
          session,
        );
      } catch (err) {
        if (!isDuplicateKeyError(err)) throw err;
        // Someone else's live redemption already owns this voucher.
        throw new ConflictException(
          'Voucher đang được dùng cho một đơn khác của bạn',
        );
      }

      console.log(
        `voucher.reserved voucherId=${reserved._id.toString()} ` +
          `orderId=${input.orderId.toString()} until=${input.reservedUntil.toISOString()}`,
      );
      return reserved;
    });
  }

  /**
   * Settles the hold: voucher RESERVED → USED, redemption → APPLIED, and the
   * campaign's spend counters move by the discount that was actually given.
   *
   * Idempotent — a replayed payment webhook finds nothing left in RESERVED and
   * returns false rather than double-counting the budget.
   */
  async redeemForOrder(orderId: Types.ObjectId): Promise<boolean> {
    return withTransaction(async (session) => {
      const redeemed = await this.repository.redeemReserved(orderId, session);
      if (!redeemed) return false;

      const applied = await this.redemptionRepository.markApplied(
        orderId,
        session,
      );
      if (applied?.campaign_id) {
        await this.campaignRepository.incrementRedeemed(
          applied.campaign_id,
          1,
          applied.voucher_discount_vnd,
          session,
        );
      }
      console.log(
        `voucher.redeemed voucherId=${redeemed._id.toString()} ` +
          `orderId=${orderId.toString()} discount=${applied?.voucher_discount_vnd ?? 0}`,
      );
      if (redeemed.customer_id) {
        void this.notifyOnce(
          redeemed.customer_id.toString(),
          `used:${redeemed._id.toString()}`,
          {
            type: NotificationTypeEnum.VOUCHER_USED,
            title: '✅ Voucher đã được áp dụng',
            body:
              `Bạn vừa tiết kiệm ` +
              `${(applied?.voucher_discount_vnd ?? 0).toLocaleString('vi-VN')}đ ` +
              `cho đơn rửa xe này.`,
            data: {
              voucherId: redeemed._id.toString(),
              orderId: orderId.toString(),
            },
          },
        );
      }
      return true;
    });
  }

  /**
   * Frees a voucher whose order died — payment failed, timed out, or the
   * booking was cancelled. Handles both a hold that never settled and one that
   * did, backing the campaign counters out in the latter case so a cancelled
   * order does not permanently consume budget.
   *
   * Idempotent: an order with no active redemption yields false.
   */
  async releaseForOrder(orderId: Types.ObjectId): Promise<boolean> {
    return withTransaction(async (session) => {
      const closed = await this.redemptionRepository.closeAnyActive(
        orderId,
        session,
      );

      // Return the voucher itself. A never-settled hold goes back via the
      // reservation CAS; a settled one goes through the refund path, which also
      // retires it if it expired while the order was alive.
      const released = await this.repository.releaseReservation(
        orderId,
        session,
      );
      if (!released && closed?.status === RedemptionStatusEnum.CANCELLED) {
        await this.repository.refund(closed.voucher_id);
      }

      if (
        closed?.campaign_id &&
        closed.status === RedemptionStatusEnum.CANCELLED
      ) {
        await this.campaignRepository.incrementRedeemed(
          closed.campaign_id,
          -1,
          -closed.voucher_discount_vnd,
          session,
        );
      }

      if (closed) {
        console.log(
          `voucher.released orderId=${orderId.toString()} outcome=${closed.status}`,
        );
      }
      return !!closed;
    });
  }

  /**
   * Releases every reservation whose hold has lapsed. Idempotent and safe to
   * re-run: it only touches redemptions still in RESERVED past `reserved_until`,
   * so an order that paid in the meantime (now APPLIED) is never disturbed.
   */
  async sweepExpiredReservations(): Promise<number> {
    const due = await this.redemptionRepository.findExpiredReservations(
      new Date(),
    );
    let released = 0;
    for (const redemption of due) {
      try {
        if (await this.releaseForOrder(redemption.order_id)) released += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `voucher.sweep_failed orderId=${redemption.order_id.toString()} reason=${msg}`,
        );
      }
    }
    if (released > 0) {
      console.log(`voucher.reservations_swept released=${released}`);
    }
    return released;
  }

  /** Breakdown frozen on the order's redemption, for invoices and admin views. */
  async findRedemptionForOrder(
    orderId: Types.ObjectId | string,
  ): Promise<VoucherRedemptionDocument | null> {
    return this.redemptionRepository.findByOrder(orderId);
  }

  // ---------- ADMIN ----------

  async adminGrantForCustomer(
    dto: GrantVoucherAdminDto,
  ): Promise<VoucherResponseDto> {
    const customer = await this.userRepository.findById(dto.customerId);
    if (!customer || !customer.is_active) {
      throw new BadRequestException('Target customer not found or inactive');
    }
    const role = await this.roleRepository.findById(customer.role_id);
    if (!role || role.code !== RoleEnum.CUSTOMER) {
      throw new BadRequestException(
        'Vouchers can only be granted to customer accounts',
      );
    }
    const voucher = await this.grantFreeWash({
      customerId: customer._id,
      expiresAt: dto.expiresAt,
      discountCapVnd: dto.discountCapVnd,
      code: dto.code,
      source: VoucherSourceEnum.ADMIN_GRANT,
      reason: dto.reason,
    });
    console.log(
      `voucher.admin_grant voucherId=${voucher._id.toString()} customerId=${customer._id.toString()}`,
    );
    return VoucherResponseDto.fromDocument(voucher, {
      name: customer.name,
      email: customer.email,
    });
  }

  /**
   * Bulk-mints `quantity` unowned pool vouchers with random codes
   * (`PREFIX-XXXXXXXXXX`). Customers later claim them by code.
   */
  async adminBulkCreate(
    dto: BulkCreateVoucherDto,
  ): Promise<{ count: number; vouchers: VoucherResponseDto[] }> {
    const campaign = dto.campaignId
      ? await this.requireCampaignForIssuing(dto.campaignId, dto.quantity)
      : null;

    const prefix = (dto.prefix ?? 'WASH').trim().toUpperCase();
    // A campaign owns the rules, so its dates and title win over the ad-hoc
    // per-batch values; the DTO fields remain for campaign-less legacy batches.
    const expiresAt =
      campaign?.valid_until ??
      dto.expiresAt ??
      new Date(Date.now() + DEFAULT_VOUCHER_TTL_DAYS * 24 * 60 * 60 * 1000);
    const discountCapVnd = dto.discountCapVnd ?? DEFAULT_FREE_WASH_CAP_VND;
    const reason =
      dto.reason ??
      (campaign ? `Chiến dịch ${campaign.name}` : `Lô phát hành ${prefix}`);

    const codes = generateUniqueCodes(prefix, dto.quantity);
    const docs = await this.repository.createBulk(
      codes.map((code) => ({
        code,
        type: VoucherTypeEnum.FREE_WASH,
        discountCapVnd,
        expiresAt,
        grantedSource: campaign?.source ?? VoucherSourceEnum.CAMPAIGN,
        grantedReason: reason,
        campaignId: campaign?._id,
      })),
    );
    console.log(
      `voucher.bulk_created count=${docs.length} prefix=${prefix} cap=${discountCapVnd} ` +
        `campaign=${campaign?._id.toString() ?? 'none'}`,
    );
    return {
      count: docs.length,
      vouchers: docs.map((d) => VoucherResponseDto.fromDocument(d)),
    };
  }

  /**
   * A customer claims a voucher by typing a code. The code is either:
   *   - a campaign's `public_claim_code`, which draws one voucher from that
   *     campaign's pool, or
   *   - an individual voucher code (legacy batches, or a code read out by staff).
   *
   * Campaign membership comes from the `campaign_id` foreign key — never from
   * parsing the code, which is what the old `PREFIX-YYYYMMDD-NNNN` regex did.
   * Renaming a code can no longer move a voucher between promotions.
   *
   * Idempotent: re-claiming a voucher the customer already holds returns it
   * rather than failing, so a retried request is harmless.
   */
  async claimByCode(
    customerId: string,
    code: string,
  ): Promise<VoucherResponseDto> {
    const normalized = normalizeVoucherCode(code);

    const campaign =
      await this.campaignRepository.findByPublicClaimCode(normalized);
    const claimed = campaign
      ? await this.claimFromCampaign(campaign, customerId)
      : await this.claimIndividualCode(normalized, customerId);

    if (!claimed) {
      // Deliberately one message for "no such code" / "already taken" /
      // "expired" / "pool empty": distinct errors would let a scraper confirm
      // which codes are real. The claim rate-limiter is the other half.
      console.warn(
        `voucher.claim_rejected customerId=${customerId} code=${maskVoucherCode(normalized)}`,
      );
      throw new NotFoundException(
        'Mã voucher không hợp lệ, đã được nhận, hoặc đã hết hạn',
      );
    }
    return this.finishClaim(customerId, claimed, campaign);
  }

  /**
   * One-tap claim straight from a campaign the customer is looking at. The id
   * comes from `GET /voucher-campaigns`, so there is no code to type — the case
   * a public promotions page needs and `claimByCode` cannot serve.
   *
   * Unlike `claimByCode`, the refusals here are NOT flattened into a single
   * 404. That flattening exists to stop a scraper confirming which secret codes
   * are real; a campaign id is published by the promotions list, so there is
   * nothing left to hide — and the app genuinely needs to tell "hết voucher"
   * apart from "bạn đã nhận rồi" to say anything useful.
   *
   * The gates run in the same order as `VoucherEligibilityService.checkCampaign`
   * so a voucher this hands out is one the checkout will actually accept.
   */
  async claimFromCampaignId(
    customerId: string,
    campaignId: string,
  ): Promise<VoucherResponseDto> {
    const campaign = await this.campaignRepository.findById(campaignId);
    // DRAFT is invisible on the whole public API, so claiming one must look
    // like a campaign that does not exist rather than one that is not ready.
    if (!campaign || campaign.status === CampaignStatusEnum.DRAFT) {
      throw new NotFoundException('Campaign not found');
    }

    this.assertCampaignClaimable(campaign);
    await this.assertTierEligible(campaign, customerId);
    assertBudgetRemaining(campaign);
    await this.assertUnderPerCustomerLimit(campaign, customerId);

    const claimed = await this.repository.claimAnyFromCampaign(
      campaign._id,
      customerId,
    );
    // Not a transaction, deliberately: `claimAnyFromCampaign` is a single
    // atomic find-and-update, so two customers racing the last voucher cannot
    // both win it, and `enforceLimitAfterClaim` below re-counts and hands back
    // anything that slipped past the pre-check. That is the same
    // compare-and-set discipline the rest of the voucher module uses.
    if (!claimed) {
      console.warn(
        `voucher.campaign_claim_empty campaign=${campaign._id.toString()} ` +
          `customerId=${customerId}`,
      );
      throw new ConflictException(
        'Chương trình đã hết voucher. Bạn quay lại vào đợt phát hành sau nhé.',
      );
    }
    const settled = await this.enforceLimitAfterClaim(
      campaign,
      customerId,
      claimed,
    );
    // enforceLimitAfterClaim either returns the voucher or throws; the nullable
    // return only exists for the pass-through callers above.
    return this.finishClaim(customerId, settled ?? claimed, campaign);
  }

  /**
   * Shared tail of every successful claim: log it, notify once, and return the
   * card with its campaign embedded so the app can render the result without a
   * second round-trip.
   */
  private async finishClaim(
    customerId: string,
    claimed: VoucherDocument,
    campaign: VoucherCampaignDocument | null,
  ): Promise<VoucherResponseDto> {
    console.log(
      `voucher.claimed customerId=${customerId} code=${maskVoucherCode(claimed.code)} ` +
        `campaign=${claimed.campaign_id?.toString() ?? 'none'}`,
    );
    void this.notifyOnce(customerId, `claimed:${claimed._id.toString()}`, {
      type: NotificationTypeEnum.VOUCHER_CLAIMED,
      title: '🎟️ Nhận voucher thành công',
      body:
        `Voucher giảm tới ${claimed.discount_cap_vnd.toLocaleString('vi-VN')}đ ` +
        `đã vào ví, dùng trước ${formatVnDate(claimed.expires_at)}.`,
      data: { voucherId: claimed._id.toString() },
    });
    const enrichedCampaign =
      campaign ??
      (claimed.campaign_id
        ? await this.campaignRepository.findById(claimed.campaign_id)
        : null);
    return VoucherResponseDto.fromDocument(
      claimed,
      undefined,
      enrichedCampaign,
    );
  }

  /**
   * Nudges owners whose vouchers lapse within `daysAhead`. Run daily; each
   * (voucher, milestone) pair is notified at most once, so re-running the job —
   * which Vercel Cron will do on retry — cannot spam anyone.
   */
  async remindExpiring(daysAhead: number): Promise<number> {
    const now = new Date();
    const until = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);
    const due = await this.repository.findExpiringOwned(now, until);

    let notified = 0;
    for (const voucher of due) {
      if (!voucher.customer_id) continue;
      const sent = await this.notifyOnce(
        voucher.customer_id.toString(),
        `expiring:${voucher._id.toString()}:${daysAhead}`,
        {
          type: NotificationTypeEnum.VOUCHER_EXPIRING,
          title:
            daysAhead <= 1
              ? '⏰ Voucher hết hạn hôm nay!'
              : `⏰ Voucher sắp hết hạn (còn ${daysAhead} ngày)`,
          body:
            `Voucher giảm tới ${voucher.discount_cap_vnd.toLocaleString('vi-VN')}đ ` +
            `sẽ hết hạn ${formatVnDate(voucher.expires_at)}. Đặt lịch ngay để dùng.`,
          data: { voucherId: voucher._id.toString(), daysAhead },
        },
      );
      if (sent) notified += 1;
    }
    if (notified > 0) {
      console.log(
        `voucher.expiry_reminders_sent days=${daysAhead} count=${notified}`,
      );
    }
    return notified;
  }

  /** Best-effort notification. Never fails the flow that triggered it. */
  private async notifyOnce(
    customerId: string,
    dedupeKey: string,
    input: {
      type: NotificationTypeEnum;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    },
  ): Promise<boolean> {
    try {
      return await notificationService.notifyUserOnce(
        customerId,
        dedupeKey,
        input,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`voucher notify failed customerId=${customerId}: ${msg}`);
      return false;
    }
  }

  /** Draws one voucher from a campaign pool, honouring the campaign's limits. */
  private async claimFromCampaign(
    campaign: VoucherCampaignDocument,
    customerId: string,
  ): Promise<VoucherDocument | null> {
    this.assertCampaignClaimable(campaign);
    await this.assertUnderPerCustomerLimit(campaign, customerId);

    const claimed = await this.repository.claimAnyFromCampaign(
      campaign._id,
      customerId,
    );
    if (!claimed) return null;
    return this.enforceLimitAfterClaim(campaign, customerId, claimed);
  }

  /** Claims one specific voucher code, honouring its campaign's limits. */
  private async claimIndividualCode(
    code: string,
    customerId: string,
  ): Promise<VoucherDocument | null> {
    const existing = await this.repository.findByCode(code);
    if (!existing) return null;

    // Already theirs → replay, so a retried claim is a no-op rather than a 404.
    if (existing.customer_id?.toString() === customerId) return existing;

    const campaign = existing.campaign_id
      ? await this.campaignRepository.findById(existing.campaign_id)
      : null;
    if (campaign) {
      this.assertCampaignClaimable(campaign);
      await this.assertUnderPerCustomerLimit(campaign, customerId);
    }

    const claimed = await this.repository.claimByCode(code, customerId);
    if (!claimed || !campaign) return claimed;
    return this.enforceLimitAfterClaim(campaign, customerId, claimed);
  }

  /**
   * Re-counts after the claim landed and undoes it if the customer went over.
   * Two simultaneous claims can both pass the pre-check; only one survives this,
   * which gives us single-claim semantics without a transaction. Phase 3 folds
   * this into the redemption transaction.
   */
  private async enforceLimitAfterClaim(
    campaign: VoucherCampaignDocument,
    customerId: string,
    claimed: VoucherDocument,
  ): Promise<VoucherDocument | null> {
    const held = await this.repository.countByCampaignForCustomer(
      campaign._id,
      customerId,
    );
    if (held <= campaign.max_uses_per_customer) return claimed;

    await this.repository.releaseClaim(claimed._id, customerId);
    console.warn(
      `voucher.claim_over_limit campaign=${campaign._id.toString()} ` +
        `customerId=${customerId} held=${held} limit=${campaign.max_uses_per_customer}`,
    );
    throw new ConflictException(
      'Bạn đã nhận đủ số voucher của chương trình này.',
    );
  }

  /**
   * Loads the campaign a batch is being minted into and refuses the mint if it
   * would breach `max_uses_total`. Checked before insert so an over-issue leaves
   * no orphan vouchers to clean up.
   */
  private async requireCampaignForIssuing(
    campaignId: string,
    quantity: number,
  ): Promise<VoucherCampaignDocument> {
    const campaign = await this.campaignRepository.findById(campaignId);
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status === CampaignStatusEnum.ENDED) {
      throw new ConflictException(
        'Chiến dịch đã kết thúc, không phát hành thêm voucher được.',
      );
    }
    if (campaign.max_uses_total != null) {
      const issued = await this.repository.countByCampaign(campaign._id);
      if (issued + quantity > campaign.max_uses_total) {
        throw new ConflictException(
          `Vượt giới hạn phát hành: chiến dịch cho phép ${campaign.max_uses_total}, ` +
            `đã phát ${issued}, đang xin thêm ${quantity}.`,
        );
      }
    }
    return campaign;
  }

  /** Campaign must be live and inside its window for anyone to claim from it. */
  private assertCampaignClaimable(campaign: VoucherCampaignDocument): void {
    const now = Date.now();
    const live =
      campaign.status === CampaignStatusEnum.ACTIVE &&
      campaign.valid_from.getTime() <= now &&
      campaign.valid_until.getTime() > now;
    if (!live) {
      throw new ConflictException(
        'Chương trình ưu đãi này hiện không nhận thêm người tham gia.',
      );
    }
  }

  /**
   * Tier whitelist, resolved SERVER-SIDE from the loyalty account — a request
   * cannot assert a tier it does not hold.
   *
   * Skipped entirely when the campaign has no tier restriction, which is the
   * common case, so an open promotion pays nothing for this. A customer with no
   * loyalty account is on no tier at all and therefore on no whitelist: the
   * gate fails closed, which for a targeted promotion is the right direction.
   */
  private async assertTierEligible(
    campaign: VoucherCampaignDocument,
    customerId: string,
  ): Promise<void> {
    const allowed = campaign.allowed_tier_ids ?? [];
    if (allowed.length === 0) return;

    const account =
      await this.loyaltyAccountRepository.findByCustomerId(customerId);
    const tierId = account?.tier_config_id?.toString();
    if (tierId && allowed.some((id) => id.toString() === tierId)) return;

    throw new ForbiddenException(
      'Chương trình này chỉ dành cho hạng thành viên khác.',
    );
  }

  private async assertUnderPerCustomerLimit(
    campaign: VoucherCampaignDocument,
    customerId: string,
  ): Promise<void> {
    const held = await this.repository.countByCampaignForCustomer(
      campaign._id,
      customerId,
    );
    if (held >= campaign.max_uses_per_customer) {
      throw new ConflictException(
        'Bạn đã nhận đủ số voucher của chương trình này.',
      );
    }
  }

  async adminList(query: QueryVoucherDto): Promise<VoucherListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = {
      status: query.status,
      customerId: query.customerId
        ? new Types.ObjectId(query.customerId)
        : undefined,
    };
    const [docs, total] = await Promise.all([
      this.repository.findAllPaginated(filter, page, limit),
      this.repository.countAll(filter),
    ]);
    // Enrich each voucher with the owner's name/email so the admin AND manager
    // UIs can show a name (managers cannot call /admin/users). Pool vouchers
    // (not yet claimed) have no customer_id, so skip them in the lookup.
    const customerIds = [
      ...new Set(
        docs
          .map((d) => d.customer_id?.toString())
          .filter((id): id is string => !!id),
      ),
    ];
    const [users, campaigns] = await Promise.all([
      this.userRepository.findByIds(customerIds),
      this.loadCampaigns(docs),
    ]);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    return {
      data: docs.map((d) => {
        const u = d.customer_id
          ? userMap.get(d.customer_id.toString())
          : undefined;
        return VoucherResponseDto.fromDocument(
          d,
          u ? { name: u.name, email: u.email } : undefined,
          campaigns.get(d.campaign_id?.toString() ?? ''),
        );
      }),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Tổng toàn bộ voucher theo trạng thái (cho dòng KPI đầu trang).
   * `revoked` tách khỏi `expired`: một bên là quyết định vận hành, một bên là
   * khách không dùng — gộp chung thì không đọc được chỉ số nào cả.
   */
  async adminStats(): Promise<{
    total: number;
    inPool: number;
    claimed: number;
    reserved: number;
    used: number;
    expired: number;
    revoked: number;
  }> {
    const s = await this.repository.aggregateStats();
    return {
      total: s.total,
      inPool: s.inPool,
      claimed: s.claimed,
      reserved: s.reserved,
      used: s.used,
      expired: s.expired,
      revoked: s.revoked,
    };
  }

  /**
   * Thống kê từng lô voucher pool để admin theo dõi mức sử dụng
   * (đã dùng bao nhiêu / còn trong kho / đã nhận / hết hạn).
   */
  async adminBatchSummary(): Promise<{
    batches: Array<{
      batchKey: string;
      prefix: string;
      createdAt: Date;
      expiresAt: Date;
      discountCapVnd: number;
      total: number;
      inPool: number;
      claimed: number;
      used: number;
      expired: number;
    }>;
  }> {
    const rows = await this.repository.aggregateBatches();
    return {
      batches: rows.map((r) => ({
        batchKey: r._id,
        // batchKey = PREFIX-YYYYMMDD → prefix là phần trước dấu '-' + 8 số cuối.
        prefix: r._id.replace(/-\d{8}$/, ''),
        createdAt: r.createdAt,
        expiresAt: r.expiresAt,
        discountCapVnd: r.discountCapVnd,
        total: r.total,
        inPool: r.inPool,
        claimed: r.claimed,
        used: r.used,
        expired: r.expired,
      })),
    };
  }

  async adminGetById(id: string): Promise<VoucherResponseDto> {
    const doc = await this.repository.findById(id);
    if (!doc) throw new NotFoundException('Voucher not found');
    const [u, campaign] = await Promise.all([
      doc.customer_id ? this.userRepository.findById(doc.customer_id) : null,
      doc.campaign_id
        ? this.campaignRepository.findById(doc.campaign_id)
        : null,
    ]);
    return VoucherResponseDto.fromDocument(
      doc,
      u ? { name: u.name, email: u.email } : undefined,
      campaign,
    );
  }

  /**
   * Kills an UNUSED voucher early, recording who and why.
   *
   * RESERVED is refused on purpose: the voucher is attached to an order that is
   * still in flight, and revoking underneath it would leave that order priced
   * against a discount it no longer holds. Cancel the order first — that
   * releases the voucher back to UNUSED — then revoke.
   */
  async adminRevoke(
    id: string,
    reason: string,
    revokedBy?: string,
  ): Promise<VoucherResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Voucher not found');
    if (existing.status === VoucherStatusEnum.RESERVED) {
      throw new ConflictException(
        'Voucher đang được giữ cho một đơn chưa hoàn tất. ' +
          'Huỷ đơn đó trước rồi mới thu hồi được voucher.',
      );
    }
    if (existing.status !== VoucherStatusEnum.UNUSED) {
      throw new ConflictException(
        `Voucher is ${existing.status}, only UNUSED vouchers can be revoked`,
      );
    }
    const revoked = await this.repository.revoke(
      id,
      reason,
      revokedBy ? new Types.ObjectId(revokedBy) : undefined,
    );
    if (!revoked) {
      throw new ConflictException('Voucher state changed, refresh and retry');
    }
    console.log(
      `voucher.revoked voucherId=${id} by=${revokedBy ?? 'unknown'} reason="${reason}"`,
    );
    if (revoked.customer_id) {
      void this.notifyOnce(revoked.customer_id.toString(), `revoked:${id}`, {
        type: NotificationTypeEnum.VOUCHER_REVOKED,
        title: 'Voucher đã bị thu hồi',
        body: `Một voucher trong ví của bạn đã bị thu hồi. Lý do: ${reason}`,
        data: { voucherId: id },
      });
    }
    return VoucherResponseDto.fromDocument(revoked);
  }

  /**
   * Flips every UNUSED voucher past its expires_at to EXPIRED. Idempotent; the
   * daily cron calls this. Returns the number of vouchers flipped.
   */
  async expireDue(): Promise<number> {
    const flipped = await this.repository.expireDueVouchers(new Date());
    if (flipped > 0) {
      console.log(`Expired ${flipped} due vouchers`);
    }
    return flipped;
  }
}

/**
 * Draws `count` distinct codes for one batch. Deduplicating in-process keeps a
 * single `insertMany` from failing on its own internal collision; cross-batch
 * uniqueness is still enforced by the index on `vouchers.code`.
 */
function generateUniqueCodes(prefix: string, count: number): string[] {
  const codes = new Set<string>();
  // Bounded so a pathological RNG cannot spin forever; 50 bits of entropy means
  // the loop realistically never runs past `count` iterations.
  const maxDraws = count * 10 + 100;
  for (let draw = 0; codes.size < count && draw < maxDraws; draw++) {
    codes.add(generateVoucherCode(prefix));
  }
  return [...codes];
}

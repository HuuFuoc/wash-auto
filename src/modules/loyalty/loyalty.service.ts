import { Types } from 'mongoose';
import {
  InternalServerErrorException,
  NotFoundException,
} from '../../common/exceptions';
import { LoyaltyAccountResponseDto } from '../../shared/loyalty/dto/loyalty-account-response.dto';
import {
  LoyaltyTransactionListResponseDto,
  LoyaltyTransactionResponseDto,
} from '../../shared/loyalty/dto/loyalty-transaction-response.dto';
import { LoyaltyTransactionTypeEnum } from '../../shared/loyalty/types/loyalty-transaction-type.enum';
import { NotificationTypeEnum } from '../../shared/notification/types/notification-type.enum';
import { notificationService } from '../notification/notification.router';
import { TierNameEnum } from '../../shared/tier-config/types/tier-name.enum';
import { tierLabel } from '../../shared/tier-config/tier-label';
import { VoucherSourceEnum } from '../../shared/voucher/types/voucher-source.enum';
import { TierConfigDocument } from '../tier-config/tier-config.model';
import { TierConfigRepository } from '../tier-config/tier-config.repository';
import { VoucherService } from '../voucher/voucher.service';
import { LoyaltyAccountDocument } from './loyalty-account.model';
import { LoyaltyAccountRepository } from './loyalty-account.repository';
import { LoyaltyTransactionRepository } from './loyalty-transaction.repository';

// Penalty for not showing up to a confirmed booking.
const NO_SHOW_PENALTY_POINTS = 50;

// The voucher economics that used to live here as module constants
// (WASHES_PER_FREE_VOUCHER, MIN_VALID_WASH_VND, VOUCHER_GIVEAWAY_RATE,
// VOUCHER_FLOOR_VND, VOUCHER_CEIL_VND) now come from TierConfig, so marketing
// can move a threshold without a deploy and each tier can reward differently.

/**
 * Value of the reward voucher for `spendVnd` of accumulated eligible spend,
 * under one tier's economics: a percentage of the spend, scaled by the tier
 * multiplier, then clamped between the tier's floor and ceiling.
 *
 * Exported so the gamification DTO can show an honest estimate of what the
 * customer is working toward, computed by the same formula that will actually
 * mint the voucher.
 */
export function rewardCapFor(
  tier: TierConfigDocument,
  spendVnd: number,
): number {
  const raw = Math.round(
    (spendVnd *
      tier.voucher_reward_rate_percent *
      tier.voucher_reward_multiplier) /
      100,
  );
  return Math.min(
    Math.max(raw, tier.voucher_reward_floor_vnd),
    tier.voucher_reward_ceil_vnd,
  );
}

/**
 * Projects the reward a customer is heading for, by extrapolating their spend
 * so far across the full milestone. An estimate, clearly — but one produced by
 * the real formula rather than a hand-wavy number in the UI.
 */
export function estimateReward(
  tier: TierConfigDocument,
  spendSoFarVnd: number,
  washesSoFar: number,
): number {
  if (washesSoFar <= 0) return tier.voucher_reward_floor_vnd;
  const projectedSpend = Math.round(
    (spendSoFarVnd / washesSoFar) * tier.washes_per_reward_voucher,
  );
  return rewardCapFor(tier, projectedSpend);
}

/**
 * The single rule for "which tier does this balance earn": the highest active
 * tier whose threshold is met. `findActive` returns ascending priority, so the
 * last match wins. Returns null only when no tier is seeded at all.
 *
 * Shared by the points-change path and the dangling-reference repair so the two
 * can never disagree about what a balance is worth.
 */
export function highestTierFor(
  tiers: TierConfigDocument[],
  balance: number,
): TierConfigDocument | null {
  let target: TierConfigDocument | null = null;
  for (const t of tiers) {
    if (balance >= t.min_loyalty_points) target = t;
  }
  return target;
}

// Business logic copied verbatim from features/loyalty/loyalty.service.ts; only
// DI + Nest exceptions + Logger were swapped out.
export class LoyaltyService {
  constructor(
    private readonly loyaltyRepository: LoyaltyAccountRepository,
    private readonly transactionRepository: LoyaltyTransactionRepository,
    private readonly tierConfigRepository: TierConfigRepository,
    private readonly voucherService: VoucherService,
  ) {}

  /**
   * Ensures a loyalty account exists for the customer. Idempotent - returns the
   * existing account if already present. New accounts start at the None tier.
   */
  async ensureForCustomer(
    customerId: Types.ObjectId | string,
  ): Promise<LoyaltyAccountDocument> {
    const existing = await this.loyaltyRepository.findByCustomerId(customerId);
    if (existing) {
      // Self-heal. The stored tier is DERIVED from points_balance, so any
      // disagreement is corruption, and there are two flavours of it:
      //
      //   1. A tier_config_id that no longer resolves. seedDefaults used to
      //      drop and recreate the whole collection on boot, so every restart
      //      minted new _ids and orphaned every account pointing at the
      //      previous generation.
      //   2. A tier that resolves but is WRONG. The previous version of this
      //      repair snapped case 1 to None, which silently demoted paying
      //      customers. Those accounts now look consistent — a live
      //      tier_config_id — so nothing reconsidered them, and a 438-point
      //      customer stayed None indefinitely (the tier is otherwise only
      //      recomputed when points change).
      //
      // Both are fixed the same way: re-derive from the balance with the rule
      // recomputeTierAndLog uses. No tier_changed audit row is written — the
      // customer's standing never actually changed, only the pointer, so
      // inventing promotion events would misreport history.
      const tiers = await this.tierConfigRepository.findActive();
      const earnedTier = highestTierFor(tiers, existing.points_balance);
      if (!earnedTier) {
        throw new InternalServerErrorException(
          'None tier_config not seeded - restart app',
        );
      }
      if (earnedTier._id.equals(existing.tier_config_id)) return existing;

      const linked = await this.tierConfigRepository.findById(
        existing.tier_config_id,
      );
      const repaired = await this.loyaltyRepository.updateById(existing._id, {
        tierConfigId: earnedTier._id,
      });
      console.warn(
        `Loyalty account ${existing._id.toString()} had tier ` +
          `${linked?.tier_name ?? 'MISSING'} - repaired to ${earnedTier.tier_name} ` +
          `from balance ${existing.points_balance}`,
      );
      return repaired ?? existing;
    }

    const baseTier = await this.tierConfigRepository.findByName(
      TierNameEnum.NONE,
    );
    if (!baseTier) {
      throw new InternalServerErrorException(
        'None tier_config not seeded - restart app',
      );
    }

    const created = await this.loyaltyRepository.create({
      customerId: new Types.ObjectId(customerId),
      tierConfigId: baseTier._id,
    });
    console.log('Created loyalty account at None tier', {
      customerId: customerId.toString(),
    });
    return created;
  }

  async getForCustomer(customerId: string): Promise<LoyaltyAccountResponseDto> {
    const account = await this.ensureForCustomer(customerId);
    const [tier, ladder] = await Promise.all([
      this.tierConfigRepository.findById(account.tier_config_id),
      this.tierConfigRepository.findActive(),
    ]);
    if (!tier) {
      throw new NotFoundException(
        'Linked tier_config not found - DB inconsistent',
      );
    }
    // Computed here rather than in the DTO so the estimate always comes from
    // the same function that actually mints the voucher.
    const estimate = estimateReward(
      tier,
      account.spend_toward_voucher,
      account.successful_washes_toward_voucher,
    );
    return LoyaltyAccountResponseDto.fromDocument(
      account,
      tier,
      ladder,
      estimate,
    );
  }

  async getTierForCustomer(
    customerId: string,
  ): Promise<TierConfigDocument | null> {
    const account = await this.ensureForCustomer(customerId);
    return this.tierConfigRepository.findById(account.tier_config_id);
  }

  async listTransactions(
    customerId: string,
    page: number,
    limit: number,
  ): Promise<LoyaltyTransactionListResponseDto> {
    const [docs, total] = await Promise.all([
      this.transactionRepository.findByCustomerPaginated(
        customerId,
        page,
        limit,
      ),
      this.transactionRepository.countByCustomer(customerId),
    ]);
    return {
      data: docs.map((d) => LoyaltyTransactionResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /**
   * Awards points for a freshly COMPLETED order, increments wash counters,
   * mints a free-wash voucher when the 10-wash threshold trips, and recomputes
   * tier. Called by OrderService.markCompletedByWorkOrder.
   */
  async applyOrderCompleted(
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
    amountVnd: number,
    isVoucherEligibleService: boolean,
    /** What discounts took off this order, for the lifetime "you saved" figure. */
    discountVnd = 0,
  ): Promise<void> {
    const account = await this.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      account.tier_config_id,
    );
    if (!tier) {
      console.error(
        `Loyalty account ${account._id.toString()} references missing tier`,
      );
      return;
    }

    const earned = Math.floor((amountVnd / 1000) * tier.points_per_1000_vnd);
    const newBalance = account.points_balance + earned;
    const newTotalWashes = account.total_successful_washes + 1;

    const threshold = tier.washes_per_reward_voucher;
    const isValidWash =
      isVoucherEligibleService && amountVnd >= tier.minimum_valid_wash_vnd;

    let washesAfterReward = account.successful_washes_toward_voucher;
    let spendAfterReward = account.spend_toward_voucher;
    let mintedVoucherId: Types.ObjectId | undefined;
    let mintedCap = 0;

    if (isValidWash) {
      washesAfterReward += 1;
      spendAfterReward += amountVnd;

      // `>=` rather than `===`, and the threshold is SUBTRACTED rather than
      // zeroed: if an operator lowers the threshold from 10 to 8, a customer
      // sitting on 9 qualifies on their next wash and keeps the surplus toward
      // the following voucher. Lowering a threshold can never destroy progress.
      if (washesAfterReward >= threshold) {
        mintedCap = rewardCapFor(tier, spendAfterReward);
        const voucher = await this.voucherService.grantFreeWash({
          customerId: new Types.ObjectId(customerId),
          discountCapVnd: mintedCap,
          expiresAt: new Date(
            Date.now() + tier.voucher_expiry_days * 24 * 60 * 60 * 1000,
          ),
          source: VoucherSourceEnum.LOYALTY_MILESTONE,
          reason:
            `Thưởng mốc ${threshold} lượt rửa hợp lệ ` +
            `(chi tiêu ${spendAfterReward.toLocaleString('vi-VN')}đ, hạng ${tierLabel(tier.tier_name)})`,
        });
        mintedVoucherId = voucher._id;
        washesAfterReward -= threshold;
        spendAfterReward = 0;
      }
    }

    await this.loyaltyRepository.updateById(account._id, {
      pointsBalance: newBalance,
      successfulWashesTowardVoucher: washesAfterReward,
      spendTowardVoucher: spendAfterReward,
      totalSuccessfulWashes: newTotalWashes,
      lifetimePoints: account.lifetime_points + earned,
      lifetimeSpendVnd: account.lifetime_spend_vnd + amountVnd,
      lifetimeSavedVnd: account.lifetime_saved_vnd + Math.max(0, discountVnd),
    });

    if (mintedVoucherId) {
      void this.notifyVoucherGranted(customerId, mintedCap, threshold);
    } else if (isValidWash) {
      void this.notifyIfNearVoucher(
        customerId,
        washesAfterReward,
        threshold,
        spendAfterReward,
        tier,
      );
    }

    await this.transactionRepository.create({
      customerId: new Types.ObjectId(customerId),
      type: LoyaltyTransactionTypeEnum.EARN_COMPLETED,
      pointsDelta: earned,
      balanceAfter: newBalance,
      orderId,
      reason: `Earned ${earned} points from order ${orderId.toString()}`,
    });

    if (mintedVoucherId) {
      await this.transactionRepository.create({
        customerId: new Types.ObjectId(customerId),
        type: LoyaltyTransactionTypeEnum.VOUCHER_GRANTED,
        pointsDelta: 0,
        balanceAfter: newBalance,
        orderId,
        voucherId: mintedVoucherId,
        reason: `Voucher thưởng cap ${mintedCap.toLocaleString('vi-VN')}đ tại mốc ${threshold} lượt hợp lệ`,
      });
    }

    await this.recomputeTierAndLog(
      account._id,
      new Types.ObjectId(customerId),
      newBalance,
      tier,
      orderId,
    );
  }

  /**
   * Penalises the customer for a NO_SHOW: deducts a fixed penalty (clamped at
   * 0), logs a transaction, and may demote tier.
   */
  async applyOrderNoShow(
    customerId: Types.ObjectId | string,
    orderId: Types.ObjectId,
  ): Promise<void> {
    const account = await this.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      account.tier_config_id,
    );
    if (!tier) {
      console.error(
        `Loyalty account ${account._id.toString()} references missing tier`,
      );
      return;
    }

    const deducted = Math.min(account.points_balance, NO_SHOW_PENALTY_POINTS);
    const newBalance = account.points_balance - deducted;

    await this.loyaltyRepository.updateById(account._id, {
      pointsBalance: newBalance,
    });

    await this.transactionRepository.create({
      customerId: new Types.ObjectId(customerId),
      type: LoyaltyTransactionTypeEnum.DEDUCT_NO_SHOW,
      pointsDelta: -deducted,
      balanceAfter: newBalance,
      orderId,
      reason: `Penalty for no-show on order ${orderId.toString()}`,
    });

    await this.recomputeTierAndLog(
      account._id,
      new Types.ObjectId(customerId),
      newBalance,
      tier,
      orderId,
    );
  }

  /**
   * Annual reset: zeroes the tier-qualification balance and demotes everyone to
   * None, then logs ANNUAL_RESET.
   *
   * Three things this deliberately does NOT touch, all of which the previous
   * version wiped:
   *   - `successful_washes_toward_voucher` / `spend_toward_voucher`. Progress
   *     toward a reward voucher is not a calendar-year concept; a customer at
   *     9/10 washes on 31 December used to lose it silently overnight.
   *   - `lifetime_points` / `lifetime_spend_vnd` / `lifetime_saved_vnd`.
   *   - Vouchers already granted. They expire on their own schedule.
   *
   * Idempotent: each account is claimed with a compare-and-set on
   * `last_annual_reset_year`, so a job that fires twice — or an HTTP cron call
   * that Vercel retries — resets each account at most once per year.
   */
  async annualReset(now = new Date()): Promise<{
    resetCount: number;
    skippedCount: number;
    year: number;
  }> {
    const noneTier = await this.tierConfigRepository.findByName(
      TierNameEnum.NONE,
    );
    if (!noneTier) {
      throw new InternalServerErrorException(
        'None tier_config not seeded - cannot run annual reset',
      );
    }

    const year = now.getUTCFullYear();
    const accounts = await this.loyaltyRepository.findDueForAnnualReset(year);
    let resetCount = 0;
    let skippedCount = 0;

    for (const account of accounts) {
      const previousTierId = account.tier_config_id;
      try {
        // Claim first. Losing this race means a peer already reset the account.
        if (
          !(await this.loyaltyRepository.claimForAnnualReset(account._id, year))
        ) {
          skippedCount += 1;
          continue;
        }

        await this.loyaltyRepository.updateById(account._id, {
          pointsBalance: 0,
          tierConfigId: noneTier._id,
          lastAnnualResetAt: now,
        });
        await this.transactionRepository.create({
          customerId: account.customer_id,
          type: LoyaltyTransactionTypeEnum.ANNUAL_RESET,
          pointsDelta: -account.points_balance,
          balanceAfter: 0,
          previousTierConfigId: previousTierId,
          newTierConfigId: noneTier._id,
          reason:
            `Annual reset for ${year}. Điểm về 0, hạng về None. ` +
            `Tiến độ voucher (${account.successful_washes_toward_voucher} lượt) được giữ nguyên.`,
        });
        void this.notifyTierReset(account.customer_id.toString(), year);
        resetCount += 1;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(
          `Annual reset failed for accountId=${account._id.toString()} reason=${msg}`,
        );
      }
    }
    console.log(
      `loyalty.annual_reset year=${year} reset=${resetCount} skipped=${skippedCount}`,
    );
    return { resetCount, skippedCount, year };
  }

  /**
   * Warns customers whose tier is about to be reset. Run on a schedule ahead of
   * the reset itself so the notification lands during the grace period rather
   * than after the points are already gone.
   *
   * Idempotent through the notification layer's own dedupe key, so re-running it
   * on the same day does not spam anyone.
   */
  async notifyUpcomingReset(daysUntilReset: number): Promise<number> {
    const accounts = await this.loyaltyRepository.findAll();
    let notified = 0;
    for (const account of accounts) {
      if (account.points_balance <= 0) continue;
      const tier = await this.tierConfigRepository.findById(
        account.tier_config_id,
      );
      if (!tier || tier.tier_name === TierNameEnum.NONE) continue;

      await this.notify(
        account.customer_id.toString(),
        `reset-warning:${new Date().getUTCFullYear()}:${daysUntilReset}`,
        {
          type: NotificationTypeEnum.LOYALTY_RESET_WARNING,
          title: `Còn ${daysUntilReset} ngày để giữ hạng ${tierLabel(tier.tier_name)}`,
          body:
            `Điểm tích lũy sẽ về 0 vào đầu năm sau. Tiến độ voucher của bạn ` +
            `(${account.successful_washes_toward_voucher} lượt) vẫn được giữ nguyên.`,
          data: { tierName: tier.tier_name, daysUntilReset },
        },
      );
      notified += 1;
    }
    console.log(`loyalty.reset_warning_sent count=${notified}`);
    return notified;
  }

  // ---------- notifications ----------

  /**
   * All loyalty notifications go through here. Best-effort by design: a
   * notification failure must never roll back the points the customer earned.
   */
  private async notify(
    customerId: string,
    dedupeKey: string,
    input: {
      type: NotificationTypeEnum;
      title: string;
      body: string;
      data?: Record<string, unknown>;
    },
  ): Promise<void> {
    try {
      await notificationService.notifyUserOnce(customerId, dedupeKey, input);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(`loyalty notify failed customerId=${customerId}: ${msg}`);
    }
  }

  private async notifyVoucherGranted(
    customerId: Types.ObjectId | string,
    capVnd: number,
    threshold: number,
  ): Promise<void> {
    await this.notify(
      customerId.toString(),
      // Milestones are rare and each mints a distinct voucher, so the timestamp
      // keeps two legitimate rewards from deduping into one.
      `voucher-granted:${Date.now()}`,
      {
        type: NotificationTypeEnum.VOUCHER_GRANTED,
        title: '🎁 Bạn vừa nhận voucher thưởng!',
        body:
          `Hoàn thành ${threshold} lượt rửa hợp lệ — voucher giảm tới ` +
          `${capVnd.toLocaleString('vi-VN')}đ đã vào ví của bạn.`,
        data: { capVnd, threshold },
      },
    );
  }

  /** Nudges a customer who is one or two washes from their next reward. */
  private async notifyIfNearVoucher(
    customerId: Types.ObjectId | string,
    washesSoFar: number,
    threshold: number,
    spendSoFar: number,
    tier: TierConfigDocument,
  ): Promise<void> {
    const remaining = threshold - washesSoFar;
    if (remaining < 1 || remaining > 2) return;

    await this.notify(
      customerId.toString(),
      // Keyed on the progress point, so the same nudge is not repeated until
      // the customer actually moves forward.
      `voucher-near:${threshold}:${washesSoFar}`,
      {
        type: NotificationTypeEnum.VOUCHER_MILESTONE_NEAR,
        title: `Còn ${remaining} lượt nữa là có voucher`,
        body:
          `Bạn đang ở ${washesSoFar}/${threshold} lượt. Phần thưởng ước tính ` +
          `khoảng ${estimateReward(tier, spendSoFar, washesSoFar).toLocaleString('vi-VN')}đ.`,
        data: { washesSoFar, threshold, remaining },
      },
    );
  }

  private async notifyTierUpgraded(
    customerId: Types.ObjectId | string,
    fromTier: string,
    toTier: string,
  ): Promise<void> {
    await this.notify(
      customerId.toString(),
      `tier-up:${toTier}:${new Date().getUTCFullYear()}`,
      {
        type: NotificationTypeEnum.TIER_UPGRADED,
        title: `🎉 Chúc mừng! Bạn đã lên hạng ${tierLabel(toTier)}`,
        body: `Từ hạng ${tierLabel(fromTier)} lên ${tierLabel(toTier)} — mở khoá thêm nhiều ưu đãi.`,
        // data giữ nguyên enum để client xử lý theo máy, không phải để hiển thị.
        data: { fromTier, toTier },
      },
    );
  }

  private async notifyTierReset(
    customerId: string,
    year: number,
  ): Promise<void> {
    await this.notify(customerId, `reset-done:${year}`, {
      type: NotificationTypeEnum.LOYALTY_RESET_DONE,
      title: 'Điểm tích lũy đã được làm mới cho năm nay',
      body:
        'Hạng thành viên bắt đầu lại từ đầu, nhưng tiến độ voucher và ' +
        'lịch sử tích lũy trọn đời của bạn vẫn được giữ nguyên.',
      data: { year },
    });
  }

  /**
   * Picks the highest active tier whose min_loyalty_points <= balance. If the
   * tier changes, persists it and writes a TIER_CHANGED audit transaction.
   */
  private async recomputeTierAndLog(
    accountId: Types.ObjectId,
    customerId: Types.ObjectId,
    balance: number,
    currentTier: TierConfigDocument,
    orderId: Types.ObjectId | undefined,
  ): Promise<void> {
    const tiers = await this.tierConfigRepository.findActive();
    const target = highestTierFor(tiers, balance);
    if (!target || target._id.equals(currentTier._id)) return;

    await this.loyaltyRepository.updateById(accountId, {
      tierConfigId: target._id,
    });
    await this.transactionRepository.create({
      customerId,
      type: LoyaltyTransactionTypeEnum.TIER_CHANGED,
      pointsDelta: 0,
      balanceAfter: balance,
      orderId,
      previousTierConfigId: currentTier._id,
      newTierConfigId: target._id,
      reason: `Tier changed: ${currentTier.tier_name} → ${target.tier_name}`,
    });
    console.log(
      `Tier changed customerId=${customerId.toString()} ${currentTier.tier_name} → ${target.tier_name}`,
    );

    // Only celebrate a promotion. A demotion (no-show penalty, annual reset) is
    // not something to congratulate anyone about.
    if (target.priority_level > currentTier.priority_level) {
      void this.notifyTierUpgraded(
        customerId,
        currentTier.tier_name,
        target.tier_name,
      );
    }
  }
}

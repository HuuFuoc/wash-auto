import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { Types } from 'mongoose';
import { REDIS_CLIENT } from '../../core/cache/cache.module';
import { ServiceTypeRepository } from '../service-type/repositories/service-type.repository';
import { VoucherResponseDto } from './dto/voucher-response.dto';
import { VoucherDocument } from './entities/voucher.entity';
import { VoucherRepository } from './repositories/voucher.repository';
import { VoucherStatusEnum } from './types/voucher-status.enum';
import { VoucherTypeEnum } from './types/voucher-type.enum';

export interface IGrantByTypeInput {
  customerId: Types.ObjectId;
  type: VoucherTypeEnum;
  /**
   * Caller-supplied cap (in VND). Comes from tier_config.voucher_cap_vnd so
   * admins can re-tune perks without redeploying. Required — the service
   * never invents a number behind admin's back.
   */
  discountCapVnd: number;
  reason?: string;
  /** Override the default 90-day expiry. */
  expiresAt?: Date;
}

// Customers have 90 days from mint to redeem. Past this the daily expire
// cron flips the voucher to EXPIRED.
const DEFAULT_VOUCHER_TTL_DAYS = 90;

// Code prefix per voucher type — visible to the customer in lists and the
// granted email, so they can tell at a glance "what perk did I just earn".
const CODE_PREFIX_BY_TYPE: Record<VoucherTypeEnum, string> = {
  [VoucherTypeEnum.FREE_WASH]: 'FREEWASH',
  [VoucherTypeEnum.BRONZE_FREE_BASIC]: 'BRONZE',
  [VoucherTypeEnum.SILVER_DISCOUNT]: 'SILVER',
  [VoucherTypeEnum.GOLD_DISCOUNT]: 'GOLD',
};

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(
    private readonly repository: VoucherRepository,
    private readonly serviceTypeRepository: ServiceTypeRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Mints a voucher whose semantics are driven by `type`:
   *
   *   BRONZE_FREE_BASIC — locked to the service flagged `is_default_basic`.
   *                       Cap typically equals Basic base price so it acts
   *                       as a "free 1 lần Basic" reward.
   *   SILVER_DISCOUNT   — fixed VND off any active service.
   *   GOLD_DISCOUNT     — fixed VND off any active service (higher cap).
   *   FREE_WASH         — legacy single-type voucher; mint still supported
   *                       for admin-issued grants but no new milestones
   *                       produce it.
   *
   * Called by LoyaltyService when a customer hits the wash milestone, and
   * by future admin endpoints that hand out comp vouchers.
   */
  async grantByType(input: IGrantByTypeInput): Promise<VoucherDocument> {
    const code = await this.generateCode(input.type);
    const expiresAt =
      input.expiresAt ??
      new Date(Date.now() + DEFAULT_VOUCHER_TTL_DAYS * 24 * 60 * 60 * 1000);

    // BRONZE_FREE_BASIC is restricted to the service admin flagged as the
    // default Basic Wash. Snapshot the id at mint time so renaming the
    // service later does not orphan in-flight vouchers. If admin has not
    // flagged any service we mint with an empty list so the reward is not
    // lost — the customer will simply be able to use it on any service.
    let applicableServiceTypeIds: Types.ObjectId[] | undefined;
    if (input.type === VoucherTypeEnum.BRONZE_FREE_BASIC) {
      const basic = await this.serviceTypeRepository.findDefaultBasic();
      if (basic) {
        applicableServiceTypeIds = [basic._id];
      } else {
        this.logger.warn(
          'No service flagged is_default_basic — minting BRONZE_FREE_BASIC without service restriction',
        );
      }
    }

    const voucher = await this.repository.create({
      customerId: input.customerId,
      code,
      type: input.type,
      discountCapVnd: input.discountCapVnd,
      applicableServiceTypeIds,
      expiresAt,
      grantedReason: input.reason ?? `Reward (${input.type})`,
    });
    this.logger.log(
      `Granted ${input.type} voucher ${voucher.code} cap=${input.discountCapVnd} expires=${expiresAt.toISOString()} customer=${input.customerId.toString()}`,
    );
    return voucher;
  }

  async listForCustomer(
    customerId: string,
    status?: VoucherStatusEnum,
  ): Promise<VoucherResponseDto[]> {
    const docs = await this.repository.findByOwner(customerId, status);
    return docs.map((d) => VoucherResponseDto.fromDocument(d));
  }

  async getForCustomer(
    customerId: string,
    id: string,
  ): Promise<VoucherResponseDto> {
    const doc = await this.repository.findByIdForOwner(id, customerId);
    if (!doc) throw new NotFoundException('Voucher not found');
    return VoucherResponseDto.fromDocument(doc);
  }

  /**
   * Returns the voucher if it is owned by `customerId`, UNUSED, and not yet
   * expired. Returns null otherwise. Used by the pricing preview path which
   * needs to know the cap without consuming the voucher.
   */
  async findRedeemableForCustomer(
    voucherId: string,
    customerId: string,
  ): Promise<VoucherDocument | null> {
    const doc = await this.repository.findByIdForOwner(voucherId, customerId);
    if (!doc) return null;
    if (doc.status !== VoucherStatusEnum.UNUSED) return null;
    if (doc.expires_at.getTime() <= Date.now()) return null;
    return doc;
  }

  /**
   * Atomically reserves a wash voucher (any redeemable type) for `orderId`.
   * Returns the voucher if the reservation succeeded; throws NotFoundException
   * with a descriptive message otherwise so OrderService can surface it as
   * 400. Service-applicability validation is performed by the CALLER — this
   * method only handles ownership / status / expiry.
   */
  async consumeFreeWashForOrder(
    voucherId: string,
    customerId: string,
    orderId: Types.ObjectId,
  ): Promise<VoucherDocument> {
    const consumed = await this.repository.consume(
      voucherId,
      customerId,
      orderId,
    );
    if (!consumed) {
      throw new NotFoundException(
        'Voucher not found, not owned by you, expired, or already used',
      );
    }
    return consumed;
  }

  async refund(voucherId: Types.ObjectId): Promise<void> {
    await this.repository.refund(voucherId);
  }

  /**
   * Flips every UNUSED voucher past its expires_at to EXPIRED. Idempotent;
   * the daily cron calls this. Returns the number of vouchers flipped so
   * the caller can log it.
   */
  async expireDue(): Promise<number> {
    const flipped = await this.repository.expireDueVouchers(new Date());
    if (flipped > 0) {
      this.logger.log(`Expired ${flipped} due vouchers`);
    }
    return flipped;
  }

  /**
   * Generates a per-type daily-sequential voucher code. The prefix lets
   * customers tell the perk apart at a glance:
   *   BRONZE-20260527-001, SILVER-20260527-001, GOLD-20260527-001,
   *   FREEWASH-20260527-001 (legacy).
   */
  private async generateCode(type: VoucherTypeEnum): Promise<string> {
    const now = new Date();
    const day =
      `${now.getUTCFullYear()}` +
      `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(now.getUTCDate()).padStart(2, '0')}`;
    const prefix = CODE_PREFIX_BY_TYPE[type];
    const seq = await this.redis.incr(`seq:voucher:${prefix}:${day}`);
    if (seq === 1) {
      await this.redis.expire(`seq:voucher:${prefix}:${day}`, 60 * 60 * 24 * 2);
    }
    return `${prefix}-${day}-${String(seq).padStart(3, '0')}`;
  }
}

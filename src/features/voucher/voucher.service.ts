import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import type Redis from 'ioredis';
import { Types } from 'mongoose';
import { REDIS_CLIENT } from '../../core/cache/cache.module';
import { VoucherResponseDto } from './dto/voucher-response.dto';
import { VoucherDocument } from './entities/voucher.entity';
import { VoucherRepository } from './repositories/voucher.repository';
import { VoucherStatusEnum } from './types/voucher-status.enum';
import { VoucherTypeEnum } from './types/voucher-type.enum';

export interface IGrantFreeWashInput {
  customerId: Types.ObjectId;
  reason?: string;
  expiresAt?: Date;
}

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(
    private readonly repository: VoucherRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Mints a single FREE_WASH voucher with a fresh daily-sequential code.
   * Called by LoyaltyService when the 10-wash threshold trips.
   */
  async grantFreeWash(input: IGrantFreeWashInput): Promise<VoucherDocument> {
    const code = await this.generateCode();
    const voucher = await this.repository.create({
      customerId: input.customerId,
      code,
      type: VoucherTypeEnum.FREE_WASH,
      grantedReason: input.reason ?? 'Reward for 10 completed washes',
      expiresAt: input.expiresAt,
    });
    this.logger.log(
      `Granted FREE_WASH voucher ${voucher.code} to customer ${input.customerId.toString()}`,
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
   * Atomically reserves a FREE_WASH voucher for `orderId`. Returns the
   * voucher if the reservation succeeded; throws NotFoundException with a
   * descriptive message otherwise so OrderService can surface it as 400.
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
        'Voucher not found, not owned by you, or already used',
      );
    }
    if (consumed.type !== VoucherTypeEnum.FREE_WASH) {
      // Roll back the consume — this voucher type is not redeemable on
      // orders. Should not happen unless future voucher types are added.
      await this.repository.refund(consumed._id);
      throw new NotFoundException('Voucher is not redeemable for a wash');
    }
    return consumed;
  }

  async refund(voucherId: Types.ObjectId): Promise<void> {
    await this.repository.refund(voucherId);
  }

  /** Generates a daily-sequential voucher code like FREEWASH-20260527-001. */
  private async generateCode(): Promise<string> {
    const now = new Date();
    const day =
      `${now.getUTCFullYear()}` +
      `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(now.getUTCDate()).padStart(2, '0')}`;
    const seq = await this.redis.incr(`seq:voucher:${day}`);
    if (seq === 1) {
      await this.redis.expire(`seq:voucher:${day}`, 60 * 60 * 24 * 2);
    }
    return `FREEWASH-${day}-${String(seq).padStart(3, '0')}`;
  }
}

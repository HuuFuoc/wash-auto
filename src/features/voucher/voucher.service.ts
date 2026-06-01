import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type Redis from 'ioredis';
import { Types } from 'mongoose';
import { REDIS_CLIENT } from '../../core/cache/cache.module';
import { UserRepository } from '../auth/repositories/user.repository';
import { RoleEnum } from '../auth/types/role.enum';
import { RoleRepository } from '../auth/repositories/role.repository';
import { GrantVoucherAdminDto } from './dto/grant-voucher-admin.dto';
import { QueryVoucherDto } from './dto/query-voucher.dto';
import { VoucherListResponseDto } from './dto/voucher-list-response.dto';
import { VoucherResponseDto } from './dto/voucher-response.dto';
import { VoucherDocument } from './entities/voucher.entity';
import { VoucherRepository } from './repositories/voucher.repository';
import { VoucherStatusEnum } from './types/voucher-status.enum';
import { VoucherTypeEnum } from './types/voucher-type.enum';

export interface IGrantFreeWashInput {
  customerId: Types.ObjectId;
  reason?: string;
  /** Override the default 90-day expiry. */
  expiresAt?: Date;
  /** Override the default 100k VND cap. Mostly used by admin-issued grants. */
  discountCapVnd?: number;
  /** Custom readable code (admin grant). Omit to auto-generate. */
  code?: string;
}

// Hard ceiling on what a free-wash voucher can knock off a single order.
// Picked from the economics model (§5.1): a 100k cap keeps the program at
// ~5% revenue cost even when the voucher is redeemed on Detailing.
const DEFAULT_FREE_WASH_CAP_VND = 100_000;

// Customers have 90 days from mint to redeem. Past this the daily expire
// cron flips the voucher to EXPIRED.
const DEFAULT_VOUCHER_TTL_DAYS = 90;

@Injectable()
export class VoucherService {
  private readonly logger = new Logger(VoucherService.name);

  constructor(
    private readonly repository: VoucherRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /**
   * Mints a single FREE_WASH voucher with a fresh daily-sequential code.
   * Called by LoyaltyService when the 10-wash threshold trips.
   *
   * The cap and expiry default to program-wide constants — overriding them
   * is only intended for admin-issued grants (e.g. service-recovery comps).
   */
  async grantFreeWash(input: IGrantFreeWashInput): Promise<VoucherDocument> {
    let code: string;
    if (input.code) {
      code = input.code.trim().toUpperCase();
      const existing = await this.repository.findByCode(code);
      if (existing) {
        throw new ConflictException(`Mã voucher "${code}" đã tồn tại`);
      }
    } else {
      code = await this.generateCode();
    }
    const expiresAt =
      input.expiresAt ??
      new Date(Date.now() + DEFAULT_VOUCHER_TTL_DAYS * 24 * 60 * 60 * 1000);
    const discountCapVnd = input.discountCapVnd ?? DEFAULT_FREE_WASH_CAP_VND;
    const voucher = await this.repository.create({
      customerId: input.customerId,
      code,
      type: VoucherTypeEnum.FREE_WASH,
      discountCapVnd,
      expiresAt,
      grantedReason: input.reason ?? 'Reward for 10 completed washes',
    });
    this.logger.log(
      `Granted FREE_WASH voucher ${voucher.code} cap=${discountCapVnd} expires=${expiresAt.toISOString()} customer=${input.customerId.toString()}`,
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

  // ---------- ADMIN ----------

  /**
   * Admin/manager-issued grant for a specific customer. Validates that:
   *  - target customer exists and is an active customer (not staff/admin)
   *  - cap is within program ceiling (DTO already enforces ≤200k)
   *  - reason is recorded for the audit trail
   *
   * Returns the minted voucher so the admin UI can show its code/expiry.
   */
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
      reason: dto.reason,
      expiresAt: dto.expiresAt,
      discountCapVnd: dto.discountCapVnd,
      code: dto.code,
    });
    this.logger.log(
      `Admin grant voucher voucherId=${voucher._id.toString()} customerId=${customer._id.toString()}`,
    );
    return VoucherResponseDto.fromDocument(voucher, {
      name: customer.name,
      email: customer.email,
    });
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
    // Enrich each voucher with the owner's name/email so the admin AND
    // manager UIs can show a name (managers cannot call /admin/users).
    const customerIds = [...new Set(docs.map((d) => d.customer_id.toString()))];
    const users = await this.userRepository.findByIds(customerIds);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    return {
      data: docs.map((d) => {
        const u = userMap.get(d.customer_id.toString());
        return VoucherResponseDto.fromDocument(
          d,
          u ? { name: u.name, email: u.email } : undefined,
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

  async adminGetById(id: string): Promise<VoucherResponseDto> {
    const doc = await this.repository.findById(id);
    if (!doc) throw new NotFoundException('Voucher not found');
    const u = await this.userRepository.findById(doc.customer_id);
    return VoucherResponseDto.fromDocument(
      doc,
      u ? { name: u.name, email: u.email } : undefined,
    );
  }

  /**
   * Admin revoke: flips an UNUSED voucher to EXPIRED early. Refuses if the
   * voucher has already been redeemed (USED) or is already EXPIRED — admin
   * gets a 409 instead of a silent no-op so the UI shows the actual state.
   */
  async adminRevoke(id: string, reason: string): Promise<VoucherResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Voucher not found');
    if (existing.status !== VoucherStatusEnum.UNUSED) {
      throw new ConflictException(
        `Voucher is ${existing.status}, only UNUSED vouchers can be revoked`,
      );
    }
    const revoked = await this.repository.revoke(id, reason);
    if (!revoked) {
      // Race: someone consumed/expired between our check and the update.
      throw new ConflictException('Voucher state changed, refresh and retry');
    }
    this.logger.log(`Admin revoked voucher voucherId=${id} reason="${reason}"`);
    return VoucherResponseDto.fromDocument(revoked);
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

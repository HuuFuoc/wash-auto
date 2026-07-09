import type Redis from 'ioredis';
import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions';
import { redisClient } from '../../core/redis';
import { BulkCreateVoucherDto } from '../../shared/voucher/dto/bulk-create-voucher.dto';
import { GrantVoucherAdminDto } from '../../shared/voucher/dto/grant-voucher-admin.dto';
import { QueryVoucherDto } from '../../shared/voucher/dto/query-voucher.dto';
import { VoucherListResponseDto } from '../../shared/voucher/dto/voucher-list-response.dto';
import { VoucherResponseDto } from '../../shared/voucher/dto/voucher-response.dto';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { VoucherTypeEnum } from '../../shared/voucher/types/voucher-type.enum';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { VoucherDocument } from './voucher.model';
import { VoucherRepository } from './voucher.repository';

export interface IGrantFreeWashInput {
  customerId: Types.ObjectId;
  expiresAt?: Date;
  discountCapVnd?: number;
  code?: string;
}

// Hard ceiling on what a free-wash voucher can knock off a single order.
const DEFAULT_FREE_WASH_CAP_VND = 100_000;

// Customers have 90 days from mint to redeem.
const DEFAULT_VOUCHER_TTL_DAYS = 90;

// Business logic copied verbatim from features/voucher/voucher.service.ts; only
// DI (UserRepository / RoleRepository / REDIS_CLIENT) + Nest exceptions +
// Logger were swapped out.
export class VoucherService {
  constructor(
    private readonly repository: VoucherRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly redis: Redis = redisClient,
  ) {}

  /**
   * Mints a single FREE_WASH voucher with a fresh daily-sequential code.
   * Called by LoyaltyService when the 10-wash threshold trips.
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
    });
    console.log(
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
   * expired. Returns null otherwise. Used by the pricing preview path.
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
   * Atomically reserves a FREE_WASH voucher for `orderId`. Returns the voucher
   * if the reservation succeeded; throws NotFoundException otherwise.
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
      await this.repository.refund(consumed._id);
      throw new NotFoundException('Voucher is not redeemable for a wash');
    }
    return consumed;
  }

  async refund(voucherId: Types.ObjectId): Promise<void> {
    await this.repository.refund(voucherId);
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
    });
    console.log(
      `Admin grant voucher voucherId=${voucher._id.toString()} customerId=${customer._id.toString()}`,
    );
    return VoucherResponseDto.fromDocument(voucher, {
      name: customer.name,
      email: customer.email,
    });
  }

  /**
   * Bulk-mints `quantity` unowned pool vouchers with sequential codes
   * (`PREFIX-YYYYMMDD-NNNN`). Customers later claim them by code.
   */
  async adminBulkCreate(
    dto: BulkCreateVoucherDto,
  ): Promise<{ count: number; vouchers: VoucherResponseDto[] }> {
    const prefix = (dto.prefix ?? 'WASH').trim().toUpperCase();
    const expiresAt =
      dto.expiresAt ??
      new Date(Date.now() + DEFAULT_VOUCHER_TTL_DAYS * 24 * 60 * 60 * 1000);
    const discountCapVnd = dto.discountCapVnd ?? DEFAULT_FREE_WASH_CAP_VND;

    const codes = await this.generateBulkCodes(prefix, dto.quantity);
    const docs = await this.repository.createBulk(
      codes.map((code) => ({
        code,
        type: VoucherTypeEnum.FREE_WASH,
        discountCapVnd,
        expiresAt,
      })),
    );
    console.log(
      `Admin bulk-created ${docs.length} vouchers prefix=${prefix} cap=${discountCapVnd}`,
    );
    return {
      count: docs.length,
      vouchers: docs.map((d) => VoucherResponseDto.fromDocument(d)),
    };
  }

  /** A customer claims an unowned pool voucher by its code. */
  async claimByCode(
    customerId: string,
    code: string,
  ): Promise<VoucherResponseDto> {
    const normalized = code.trim().toUpperCase();

    // Mỗi khách chỉ nhận 1 voucher trong cùng một lô (chiến dịch). Lô = mã
    // bulk dạng PREFIX-YYYYMMDD-NNNN, gộp theo PREFIX-YYYYMMDD (bỏ '-NNNN').
    // Voucher cấp đích danh / tích lũy không theo format này nên không bị chặn.
    const isBatchCode = /^.+-\d{8}-\d{4}$/.test(normalized);
    const batchKey = isBatchCode ? normalized.replace(/-\d{4}$/, '') : null;
    if (batchKey) {
      const already = await this.repository.existsInBatchForCustomer(
        batchKey,
        customerId,
      );
      if (already) {
        throw new ConflictException(
          'Bạn đã nhận một voucher từ đợt phát hành này rồi. ' +
            'Mỗi khách chỉ nhận được 1 voucher mỗi đợt.',
        );
      }
    }

    const claimed = await this.repository.claimByCode(normalized, customerId);
    if (!claimed) {
      throw new NotFoundException(
        'Mã voucher không hợp lệ, đã được nhận, hoặc đã hết hạn',
      );
    }
    console.log(`Customer ${customerId} claimed voucher ${claimed.code}`);
    return VoucherResponseDto.fromDocument(claimed);
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
    const users = await this.userRepository.findByIds(customerIds);
    const userMap = new Map(users.map((u) => [u._id.toString(), u]));
    return {
      data: docs.map((d) => {
        const u = d.customer_id
          ? userMap.get(d.customer_id.toString())
          : undefined;
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

  /** Tổng toàn bộ voucher theo trạng thái (cho dòng KPI đầu trang). */
  async adminStats(): Promise<{
    total: number;
    inPool: number;
    claimed: number;
    used: number;
    expired: number;
  }> {
    const s = await this.repository.aggregateStats();
    return {
      total: s.total,
      inPool: s.inPool,
      claimed: s.claimed,
      used: s.used,
      expired: s.expired,
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
    const u = doc.customer_id
      ? await this.userRepository.findById(doc.customer_id)
      : null;
    return VoucherResponseDto.fromDocument(
      doc,
      u ? { name: u.name, email: u.email } : undefined,
    );
  }

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
      throw new ConflictException('Voucher state changed, refresh and retry');
    }
    console.log(`Admin revoked voucher voucherId=${id} reason="${reason}"`);
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

  /** Generates `count` sequential codes like PREFIX-YYYYMMDD-0001 (unique per prefix/day). */
  private async generateBulkCodes(
    prefix: string,
    count: number,
  ): Promise<string[]> {
    const now = new Date();
    const day =
      `${now.getUTCFullYear()}` +
      `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(now.getUTCDate()).padStart(2, '0')}`;
    const key = `seq:voucher:${prefix}:${day}`;
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const seq = await this.redis.incr(key);
      if (seq === 1) await this.redis.expire(key, 60 * 60 * 24 * 2);
      codes.push(`${prefix}-${day}-${String(seq).padStart(4, '0')}`);
    }
    return codes;
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

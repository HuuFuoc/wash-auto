import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { RoleRepository } from '../auth/repositories/role.repository';
import { UserRepository } from '../auth/repositories/user.repository';
import { RoleEnum } from '../auth/types/role.enum';
import { CreateStaffShiftDto } from './dto/create-staff-shift.dto';
import { QueryAvailableShiftDto } from './dto/query-available-shift.dto';
import { QueryStaffShiftDto } from './dto/query-staff-shift.dto';
import { SetStaffShiftStatusDto } from './dto/set-staff-shift-status.dto';
import { StaffShiftListResponseDto } from './dto/staff-shift-list-response.dto';
import { StaffShiftResponseDto } from './dto/staff-shift-response.dto';
import { UpdateStaffShiftDto } from './dto/update-staff-shift.dto';
import { StaffShiftDocument } from './entities/staff-shift.entity';
import {
  IShiftListFilter,
  StaffShiftRepository,
} from './repositories/staff-shift.repository';
import { resolveShiftBlock } from './shift-blocks';
import { ShiftStatusEnum } from './types/shift-status.enum';
import { ShiftTypeEnum } from './types/shift-type.enum';

const SHIFT_TYPE_TO_ROLE: Record<ShiftTypeEnum, RoleEnum> = {
  [ShiftTypeEnum.CASHIER]: RoleEnum.CASHIER,
  [ShiftTypeEnum.WASHER]: RoleEnum.WASHER,
};

/** A staff member that can be assigned to a shift (washer or cashier). */
export interface AssignableStaff {
  id: string;
  name: string;
  email: string;
  role: RoleEnum;
}

@Injectable()
export class StaffShiftService {
  private readonly logger = new Logger(StaffShiftService.name);

  constructor(
    private readonly repository: StaffShiftRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
  ) {}

  /**
   * Active staff (washers + cashiers) that can be assigned to a shift.
   * Managers cannot list all users (/admin/users is admin-only), but they DO
   * create shifts - so this scoped list lets them pick a real staff member
   * instead of falling back to invalid placeholder ids.
   */
  async listAssignableStaff(): Promise<AssignableStaff[]> {
    const result: AssignableStaff[] = [];
    for (const code of [RoleEnum.WASHER, RoleEnum.CASHIER]) {
      const role = await this.roleRepository.findByCode(code);
      if (!role) continue;
      const users = await this.userRepository.findPaginated(
        { roleId: role._id, isActive: true },
        1,
        200,
      );
      for (const u of users) {
        result.push({
          id: u._id.toString(),
          name: u.name,
          email: u.email,
          role: code,
        });
      }
    }
    return result;
  }

  async listAvailable(
    query: QueryAvailableShiftDto,
  ): Promise<StaffShiftResponseDto[]> {
    if (query.from > query.to) {
      throw new BadRequestException('from must be ≤ to');
    }
    const docs = await this.repository.findAvailableForBooking(
      query.from,
      query.to,
      query.shiftType,
    );
    return docs.map((d) => StaffShiftResponseDto.fromDocument(d));
  }

  async adminList(
    query: QueryStaffShiftDto,
  ): Promise<StaffShiftListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: IShiftListFilter = {
      shiftType: query.shiftType,
      status: query.status,
      startFrom: query.startFrom,
      startTo: query.startTo,
    };
    if (query.staffId) filter.staffId = new Types.ObjectId(query.staffId);

    const [docs, total] = await Promise.all([
      this.repository.findPaginated(filter, page, limit),
      this.repository.countMatching(filter),
    ]);
    return {
      data: docs.map((d) => StaffShiftResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getById(id: string): Promise<StaffShiftResponseDto> {
    const doc = await this.requireShift(id);
    return StaffShiftResponseDto.fromDocument(doc);
  }

  async create(dto: CreateStaffShiftDto): Promise<StaffShiftResponseDto> {
    // Fixed working block → derive absolute start/end (enforces office hours).
    const { startAt, endAt } = resolveShiftBlock(dto.date, dto.block);
    await this.assertStaffMatchesShiftType(dto.staffId, dto.shiftType);
    await this.assertNoStaffShiftOverlap(dto.staffId, startAt, endAt);
    const created = await this.repository.create({
      staffId: new Types.ObjectId(dto.staffId),
      shiftType: dto.shiftType,
      stationName: dto.stationName,
      startAt,
      endAt,
      note: dto.note,
    });
    this.logger.log('Manager created shift', {
      shiftId: created._id.toString(),
      staffId: dto.staffId,
      type: dto.shiftType,
    });
    return StaffShiftResponseDto.fromDocument(created);
  }

  async update(
    id: string,
    dto: UpdateStaffShiftDto,
  ): Promise<StaffShiftResponseDto> {
    const existing = await this.requireShift(id);

    const nextType = dto.shiftType ?? existing.shift_type;
    const nextStaffId = dto.staffId ?? existing.staff_id.toString();
    if (
      dto.staffId !== undefined ||
      (dto.shiftType !== undefined && dto.shiftType !== existing.shift_type)
    ) {
      await this.assertStaffMatchesShiftType(nextStaffId, nextType);
    }

    // Moving the shift requires both date and block; derive new start/end.
    let startAt: Date | undefined;
    let endAt: Date | undefined;
    if (dto.date !== undefined || dto.block !== undefined) {
      if (dto.date === undefined || dto.block === undefined) {
        throw new BadRequestException(
          'Provide both `date` and `block` to move a shift',
        );
      }
      ({ startAt, endAt } = resolveShiftBlock(dto.date, dto.block));
    }

    // Re-check overlap when the staff member or the time window changes.
    if (dto.staffId !== undefined || startAt !== undefined) {
      await this.assertNoStaffShiftOverlap(
        nextStaffId,
        startAt ?? existing.start_at,
        endAt ?? existing.end_at,
        id,
      );
    }

    const updated = await this.repository.updateById(id, {
      staffId: dto.staffId ? new Types.ObjectId(dto.staffId) : undefined,
      shiftType: dto.shiftType,
      stationName: dto.stationName,
      startAt,
      endAt,
      note: dto.note,
    });
    if (!updated) throw new NotFoundException('Shift not found');
    return StaffShiftResponseDto.fromDocument(updated);
  }

  async setStatus(
    id: string,
    dto: SetStaffShiftStatusDto,
  ): Promise<StaffShiftResponseDto> {
    const existing = await this.requireShift(id);
    this.assertValidStatusTransition(existing.status, dto.status);
    const updated = await this.repository.setStatus(id, dto.status);
    if (!updated) throw new NotFoundException('Shift not found');
    return StaffShiftResponseDto.fromDocument(updated);
  }

  // ---------- helpers ----------

  private async requireShift(id: string): Promise<StaffShiftDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Shift not found');
    }
    const doc = await this.repository.findById(id);
    if (!doc) throw new NotFoundException('Shift not found');
    return doc;
  }

  private async assertStaffMatchesShiftType(
    staffId: string,
    shiftType: ShiftTypeEnum,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(staffId)) {
      throw new BadRequestException('Invalid staffId');
    }
    const user = await this.userRepository.findById(staffId);
    if (!user || !user.is_active) {
      throw new BadRequestException('Staff user not found or inactive');
    }
    const role = await this.roleRepository.findById(user.role_id);
    if (!role) {
      throw new BadRequestException('Staff role missing');
    }
    const expected = SHIFT_TYPE_TO_ROLE[shiftType];
    if (role.code !== expected) {
      throw new BadRequestException(
        `staffId must belong to a user with role=${expected} for shiftType=${shiftType}`,
      );
    }
  }

  /** Rejects creating/moving a shift that overlaps another for the same staff. */
  private async assertNoStaffShiftOverlap(
    staffId: string,
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(staffId)) {
      throw new BadRequestException('Invalid staffId');
    }
    const overlaps = await this.repository.findOverlappingForStaff(
      new Types.ObjectId(staffId),
      startAt,
      endAt,
      excludeId,
    );
    if (overlaps.length > 0) {
      throw new BadRequestException(
        'Nhân viên đã có ca làm việc trùng giờ với khoảng thời gian này',
      );
    }
  }

  private assertValidStatusTransition(
    from: ShiftStatusEnum,
    to: ShiftStatusEnum,
  ): void {
    const valid: Record<ShiftStatusEnum, ShiftStatusEnum[]> = {
      [ShiftStatusEnum.SCHEDULED]: [
        ShiftStatusEnum.ACTIVE,
        ShiftStatusEnum.CANCELLED,
      ],
      [ShiftStatusEnum.ACTIVE]: [
        ShiftStatusEnum.COMPLETED,
        ShiftStatusEnum.CANCELLED,
      ],
      [ShiftStatusEnum.COMPLETED]: [],
      [ShiftStatusEnum.CANCELLED]: [],
    };
    if (from === to) return;
    if (!valid[from].includes(to)) {
      throw new BadRequestException(
        `Invalid status transition: ${from} → ${to}`,
      );
    }
  }
}

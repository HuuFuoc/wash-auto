import { Types } from 'mongoose';
import { BadRequestException, NotFoundException } from '../../common/exceptions';
import { CreateStaffShiftDto } from '../../features/staff-shift/dto/create-staff-shift.dto';
import { QueryAvailableShiftDto } from '../../features/staff-shift/dto/query-available-shift.dto';
import { QueryStaffShiftDto } from '../../features/staff-shift/dto/query-staff-shift.dto';
import { SetStaffShiftStatusDto } from '../../features/staff-shift/dto/set-staff-shift-status.dto';
import { StaffShiftListResponseDto } from '../../features/staff-shift/dto/staff-shift-list-response.dto';
import { StaffShiftResponseDto } from '../../features/staff-shift/dto/staff-shift-response.dto';
import { UpdateStaffShiftDto } from '../../features/staff-shift/dto/update-staff-shift.dto';
import { ShiftStatusEnum } from '../../features/staff-shift/types/shift-status.enum';
import { ShiftTypeEnum } from '../../features/staff-shift/types/shift-type.enum';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { expandSchedule, resolveShiftBlock } from './shift-blocks';
import { StaffShiftDocument } from './staff-shift.model';
import {
  IShiftListFilter,
  StaffShiftRepository,
} from './staff-shift.repository';

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

// Business logic copied verbatim from
// features/staff-shift/staff-shift.service.ts; only DI + Nest exceptions +
// Logger were swapped out.
export class StaffShiftService {
  constructor(
    private readonly repository: StaffShiftRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
  ) {}

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

  /**
   * Creates one shift per selected block. `fullday` expands to morning +
   * afternoon. All blocks are validated before any write (all-or-nothing).
   */
  async create(dto: CreateStaffShiftDto): Promise<StaffShiftResponseDto[]> {
    const blocks = expandSchedule(dto.block);
    const windows = blocks.map((block) => resolveShiftBlock(dto.date, block));

    await this.assertStaffMatchesShiftType(dto.staffId, dto.shiftType);
    for (const { startAt, endAt } of windows) {
      await this.assertNoStaffShiftOverlap(dto.staffId, startAt, endAt);
    }

    const created: StaffShiftDocument[] = [];
    for (const { startAt, endAt } of windows) {
      created.push(
        await this.repository.create({
          staffId: new Types.ObjectId(dto.staffId),
          shiftType: dto.shiftType,
          stationName: dto.stationName,
          startAt,
          endAt,
          note: dto.note,
        }),
      );
    }

    console.log('Manager created shift(s)', {
      shiftIds: created.map((c) => c._id.toString()),
      staffId: dto.staffId,
      type: dto.shiftType,
      schedule: dto.block,
    });
    return created.map((doc) => StaffShiftResponseDto.fromDocument(doc));
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

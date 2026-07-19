import { Types } from 'mongoose';
import {
  BadRequestException,
  NotFoundException,
} from '../../common/exceptions';
import { CreateStaffShiftDto } from '../../shared/staff-shift/dto/create-staff-shift.dto';
import { QueryAvailableShiftDto } from '../../shared/staff-shift/dto/query-available-shift.dto';
import { QueryStaffShiftDto } from '../../shared/staff-shift/dto/query-staff-shift.dto';
import { SetStaffShiftStatusDto } from '../../shared/staff-shift/dto/set-staff-shift-status.dto';
import { StaffShiftListResponseDto } from '../../shared/staff-shift/dto/staff-shift-list-response.dto';
import { StaffShiftResponseDto } from '../../shared/staff-shift/dto/staff-shift-response.dto';
import { UpdateStaffShiftDto } from '../../shared/staff-shift/dto/update-staff-shift.dto';
import { QueryStaffPerformanceDto } from '../../shared/staff-shift/dto/query-staff-performance.dto';
import { ShiftStatusEnum } from '../../shared/staff-shift/types/shift-status.enum';
import { StaffPerformanceRow } from '../../shared/staff-shift/types/staff-performance.type';
import {
  WasherCurrentWorkOrder,
  WasherLiveStatusRow,
} from '../../shared/staff-shift/types/washer-live-status.type';
import { WorkOrderStatusEnum } from '../../shared/work-order/types/work-order-status.enum';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { FeedbackRepository } from '../feedback/feedback.repository';
import { WorkOrderRepository } from '../work-order/work-order.repository';
import { emitSlotsChanged } from '../order/order.service';
import { expandSchedule, resolveShiftBlock } from './shift-blocks';
import { StaffShiftDocument, effectiveShiftStatus } from './staff-shift.model';
import {
  IShiftListFilter,
  StaffShiftRepository,
} from './staff-shift.repository';

// Anonymous capacity-based shifts: a shift is a bookable window (date + block)
// with a concurrent-wash capacity — no staff roster, no station. ACTIVE and
// COMPLETED are derived from the clock (effectiveShiftStatus); the only manual
// transition left is cancelling.
export class StaffShiftService {
  constructor(
    private readonly repository: StaffShiftRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly feedbackRepository: FeedbackRepository,
  ) {}

  /**
   * Per-washer stats for the shift/performance tab: cars washed, orders
   * handled, feedback count + average rating, and working status. shiftsCount
   * only reflects legacy per-staff shifts (new shifts are anonymous).
   */
  async staffPerformance(
    query: QueryStaffPerformanceDto,
  ): Promise<StaffPerformanceRow[]> {
    const role = await this.roleRepository.findByCode(RoleEnum.WASHER);
    if (!role) return [];
    const washers = await this.userRepository.findPaginated(
      { roleId: role._id },
      1,
      500,
    );
    const ids = washers.map((u) => u._id.toString());

    const [work, feedback, shifts] = await Promise.all([
      this.workOrderRepository.washerWorkStats(ids, query.from, query.to),
      this.feedbackRepository.summaryByWashers(ids),
      this.repository.countShiftsByStaff(ids, query.from, query.to),
    ]);

    return washers.map((u) => {
      const id = u._id.toString();
      const w = work.get(id);
      const f = feedback.get(id);
      return {
        washerId: id,
        name: u.name,
        isActive: u.is_active,
        shiftsCount: shifts.get(id) ?? 0,
        carsWashed: w?.carsWashed ?? 0,
        ordersHandled: w?.ordersHandled ?? 0,
        feedbackCount: f?.count ?? 0,
        averageRating: f?.averageRating ?? 0,
      };
    });
  }

  /**
   * Live board for managers: every active washer with the ticket they are
   * working on right now (IN_PROGRESS wins over ASSIGNED) and whether a live
   * shift window covers this instant. With anonymous capacity shifts the
   * window applies shop-wide (every washer counts as on-shift); legacy
   * per-staff shifts still resolve per washer via staff_id.
   */
  async washerLiveStatus(): Promise<WasherLiveStatusRow[]> {
    const role = await this.roleRepository.findByCode(RoleEnum.WASHER);
    if (!role) return [];
    const washers = await this.userRepository.findPaginated(
      { roleId: role._id, isActive: true },
      1,
      500,
    );
    const ids = washers.map((u) => u._id);

    const [activeWork, liveShifts] = await Promise.all([
      this.workOrderRepository.findActiveByWashers(ids),
      this.repository.findShiftsContaining(new Date(), 0),
    ]);

    const workByWasher = new Map<string, typeof activeWork>();
    for (const wo of activeWork) {
      const key = wo.assigned_washer_id?.toString();
      if (!key) continue;
      const list = workByWasher.get(key) ?? [];
      list.push(wo);
      workByWasher.set(key, list);
    }
    const anonymousShiftLive = liveShifts.some((s) => !s.staff_id);
    const onShiftStaff = new Set(
      liveShifts.filter((s) => s.staff_id).map((s) => s.staff_id!.toString()),
    );

    return washers.map((u) => {
      const id = u._id.toString();
      const tickets = workByWasher.get(id) ?? [];
      const current =
        tickets.find((t) => t.status === WorkOrderStatusEnum.IN_PROGRESS) ??
        tickets
          .slice()
          .sort(
            (a, b) => a.scheduled_at.getTime() - b.scheduled_at.getTime(),
          )[0] ??
        null;

      const currentWorkOrder: WasherCurrentWorkOrder | null = current
        ? {
            id: current._id.toString(),
            code: current.code,
            plate: current.vehicle_snapshot.plate,
            vehicleTypeName: current.vehicle_snapshot.vehicle_type_name,
            serviceName: current.service_name,
            status: current.status,
            startedAt: current.started_at ?? null,
            estimatedMinutes: current.estimated_minutes,
            stationName: current.station_name,
          }
        : null;

      return {
        washerId: id,
        name: u.name,
        email: u.email,
        avatarUrl: u.avatar_url,
        onShift: anonymousShiftLive || onShiftStaff.has(id),
        status:
          current === null
            ? 'free'
            : current.status === WorkOrderStatusEnum.IN_PROGRESS
              ? 'in_progress'
              : 'assigned',
        currentWorkOrder,
      };
    });
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
   * Created shifts are bookable immediately (status SCHEDULED).
   */
  async create(dto: CreateStaffShiftDto): Promise<StaffShiftResponseDto[]> {
    const blocks = expandSchedule(dto.block);
    const windows = blocks.map((block) => resolveShiftBlock(dto.date, block));

    for (const { endAt } of windows) {
      this.assertShiftNotInPast(endAt);
    }
    for (const { startAt, endAt } of windows) {
      await this.assertNoOverlappingShift(startAt, endAt);
    }

    const created: StaffShiftDocument[] = [];
    for (const { startAt, endAt } of windows) {
      created.push(
        await this.repository.create({
          capacity: dto.capacity ?? 1,
          startAt,
          endAt,
          note: dto.note,
        }),
      );
    }

    console.log('Manager created shift(s)', {
      shiftIds: created.map((c) => c._id.toString()),
      schedule: dto.block,
      capacity: dto.capacity ?? 1,
    });
    // Khách đang mở màn đặt lịch thấy slot mới ngay, không cần refetch tay.
    for (const doc of created) emitSlotsChanged(doc.start_at);
    return created.map((doc) => StaffShiftResponseDto.fromDocument(doc));
  }

  async update(
    id: string,
    dto: UpdateStaffShiftDto,
  ): Promise<StaffShiftResponseDto> {
    const existing = await this.requireShift(id);

    let startAt: Date | undefined;
    let endAt: Date | undefined;
    if (dto.date !== undefined || dto.block !== undefined) {
      if (dto.date === undefined || dto.block === undefined) {
        throw new BadRequestException(
          'Provide both `date` and `block` to move a shift',
        );
      }
      ({ startAt, endAt } = resolveShiftBlock(dto.date, dto.block));
      this.assertShiftNotInPast(endAt);
      await this.assertNoOverlappingShift(startAt, endAt, id);
    }

    const updated = await this.repository.updateById(id, {
      capacity: dto.capacity,
      startAt,
      endAt,
      note: dto.note,
    });
    if (!updated) throw new NotFoundException('Shift not found');

    if (startAt !== undefined || dto.capacity !== undefined) {
      emitSlotsChanged(existing.start_at); // ngày cũ (hoặc capacity đổi)
      emitSlotsChanged(updated.start_at); // ngày mới
    }
    return StaffShiftResponseDto.fromDocument(updated);
  }

  /**
   * The only manual transition left: cancelling a shift that has not ended.
   * ACTIVE/COMPLETED are derived from the clock and cannot be set by hand.
   */
  async setStatus(
    id: string,
    dto: SetStaffShiftStatusDto,
  ): Promise<StaffShiftResponseDto> {
    if (dto.status !== ShiftStatusEnum.CANCELLED) {
      throw new BadRequestException(
        'Shift status is time-derived; only `cancelled` can be set manually',
      );
    }
    const existing = await this.requireShift(id);
    const current = effectiveShiftStatus(existing);
    if (current === ShiftStatusEnum.CANCELLED) {
      return StaffShiftResponseDto.fromDocument(existing);
    }
    if (current === ShiftStatusEnum.COMPLETED) {
      throw new BadRequestException('Cannot cancel a shift that already ended');
    }
    const updated = await this.repository.setStatus(
      id,
      ShiftStatusEnum.CANCELLED,
    );
    if (!updated) throw new NotFoundException('Shift not found');
    emitSlotsChanged(updated.start_at);
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

  /** Rejects creating/moving a shift into a block that already ended. */
  private assertShiftNotInPast(endAt: Date): void {
    if (endAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        'Không thể tạo ca cho khung giờ đã kết thúc. Vui lòng chọn ca còn hiệu lực.',
      );
    }
  }

  /**
   * Anonymous shifts must not overlap: one shift per block, capacity says how
   * many cars it takes. Overlap means the manager should edit capacity instead.
   */
  private async assertNoOverlappingShift(
    startAt: Date,
    endAt: Date,
    excludeId?: string,
  ): Promise<void> {
    const overlaps = await this.repository.findOverlappingShifts(
      startAt,
      endAt,
      excludeId,
    );
    if (overlaps.length > 0) {
      throw new BadRequestException(
        'Đã có ca làm việc trong khung giờ này. Hãy sửa sức chứa (capacity) của ca đó thay vì tạo ca mới.',
      );
    }
  }
}

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
import { RoleRepository } from '../auth/repositories/role.repository';
import { UserRepository } from '../auth/repositories/user.repository';
import { RoleEnum } from '../auth/types/role.enum';
import { OrderRepository } from '../order/repositories/order.repository';
import { OrderService } from '../order/services/order.service';
import { OrderStatusEnum } from '../order/types/order-status.enum';
import { PaymentMethodEnum } from '../order/types/payment-method.enum';
import { PaymentStatusEnum } from '../order/types/payment-status.enum';
import { ServiceTypeRepository } from '../service-type/repositories/service-type.repository';
import { StaffShiftRepository } from '../staff-shift/repositories/staff-shift.repository';
import { VehicleTypeRepository } from '../vehicle-type/repositories/vehicle-type.repository';
import { VehicleRepository } from '../vehicle/repositories/vehicle.repository';
import { AssignmentService } from './assignment.service';
import { QcWorkOrderDto } from './dto/qc-work-order.dto';
import { QueryWorkOrderDto } from './dto/query-work-order.dto';
import {
  WorkOrderListResponseDto,
  WorkOrderResponseDto,
} from './dto/work-order-response.dto';
import { WorkOrderDocument } from './entities/work-order.entity';
import {
  IWorkOrderListFilter,
  WorkOrderRepository,
} from './repositories/work-order.repository';
import { WorkOrderStatusEnum } from './types/work-order-status.enum';

@Injectable()
export class WorkOrderService {
  private readonly logger = new Logger(WorkOrderService.name);

  constructor(
    private readonly repository: WorkOrderRepository,
    private readonly orderRepository: OrderRepository,
    private readonly orderService: OrderService,
    private readonly serviceTypeRepository: ServiceTypeRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly vehicleTypeRepository: VehicleTypeRepository,
    private readonly staffShiftRepository: StaffShiftRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly assignmentService: AssignmentService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ---------- CASHIER / MANAGER ----------

  /**
   * Cashier check-in: turns a confirmed order into a job ticket. Creates the
   * work order (status WAITING) and moves the order CONFIRMED → CHECKED_IN.
   * Vehicle + service details are snapshotted so the ticket is stable.
   */
  async createFromOrder(
    orderId: string,
    actorId: string,
    checkinPhotos: string[] = [],
  ): Promise<WorkOrderResponseDto> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Order not found');
    }
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.status !== OrderStatusEnum.CONFIRMED) {
      throw new BadRequestException(
        `Work order can only be created from a confirmed order (current status: ${order.status})`,
      );
    }
    const existing = await this.repository.findByOrderId(order._id);
    if (existing) {
      throw new ConflictException('A work order already exists for this order');
    }

    const [service, vehicle, shift] = await Promise.all([
      this.serviceTypeRepository.findById(order.service_type_id),
      this.vehicleRepository.findById(order.vehicle_id),
      this.staffShiftRepository.findById(order.staff_shift_id),
    ]);
    if (!service) throw new BadRequestException('Order service type missing');
    if (!vehicle) throw new BadRequestException('Order vehicle missing');
    const vehicleType = await this.vehicleTypeRepository.findById(
      vehicle.vehicle_type_id,
    );

    const created = await this.repository.create({
      orderId: order._id,
      code: await this.generateCode(),
      vehicleSnapshot: {
        plate: vehicle.license_plate,
        vehicle_type_name: vehicleType?.name ?? 'Unknown',
        color: vehicle.color,
      },
      serviceName: service.name,
      // Snapshot the (service, vehicle type) pair + appointment time so the
      // queue/auto-assign engine is self-contained. preferred_washer_id is the
      // washer pinned at booking (the booked shift's staff), preferred at
      // check-in when still eligible.
      serviceTypeId: order.service_type_id,
      vehicleTypeId: vehicle.vehicle_type_id,
      scheduledAt: order.scheduled_at,
      preferredWasherId: shift?.staff_id,
      // Checklist ticking was removed from the washer flow (Start → Finish →
      // QC). Kept as an empty array for schema/response compatibility.
      checklist: [],
      checkinPhotos,
      // Duration was snapshotted on the order at booking (varies by vehicle
      // type); fall back to the service default for legacy orders only.
      estimatedMinutes:
        order.estimated_minutes > 0
          ? order.estimated_minutes
          : service.estimated_minutes,
      stationName: shift?.station_name,
    });

    // Cash is collected at the counter when the customer arrives, so check-in
    // settles payment in the same step — no separate mark-paid action needed.
    const settlesCash =
      order.payment_method === PaymentMethodEnum.CASH &&
      order.payment_status !== PaymentStatusEnum.PAID;
    await this.orderRepository.updateById(order._id, {
      status: OrderStatusEnum.CHECKED_IN,
      ...(settlesCash ? { paymentStatus: PaymentStatusEnum.PAID } : {}),
    });

    this.logger.log(
      `Work order ${created.code} created for order ${orderId} by ${actorId}`,
    );

    // Try to auto-assign immediately (event-driven push). A failure here must
    // never fail check-in — the order is already CHECKED_IN and the ticket
    // simply stays WAITING for the next free eligible washer.
    let finalWo = created;
    try {
      await this.assignmentService.tryAutoAssign(created);
      finalWo = (await this.repository.findById(created._id)) ?? created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Auto-assign on check-in failed for ${created.code}: ${msg}`,
      );
    }
    return WorkOrderResponseDto.fromDocument(finalWo);
  }

  async adminList(query: QueryWorkOrderDto): Promise<WorkOrderListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: IWorkOrderListFilter = { status: query.status };
    if (query.washerId) {
      filter.assignedWasherId = new Types.ObjectId(query.washerId);
    }

    const [docs, total] = await Promise.all([
      this.repository.findPaginated(filter, page, limit),
      this.repository.countMatching(filter),
    ]);
    return {
      data: docs.map((d) => WorkOrderResponseDto.fromDocument(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async adminGetOne(id: string): Promise<WorkOrderResponseDto> {
    const doc = await this.requireWorkOrder(id);
    return WorkOrderResponseDto.fromDocument(doc);
  }

  /** The WAITING FIFO queue (earliest appointment first, then arrival). */
  async listQueue(): Promise<WorkOrderResponseDto[]> {
    const docs = await this.repository.findWaitingQueue();
    return docs.map((d) => WorkOrderResponseDto.fromDocument(d));
  }

  /** Assign (or re-assign) a washer. Allowed only before work starts. */
  async assignWasher(
    id: string,
    washerId: string,
    actorId: string,
  ): Promise<WorkOrderResponseDto> {
    const wo = await this.requireWorkOrder(id);
    if (
      wo.status !== WorkOrderStatusEnum.WAITING &&
      wo.status !== WorkOrderStatusEnum.ASSIGNED
    ) {
      throw new BadRequestException(
        `Cannot assign a washer to a work order in status ${wo.status}`,
      );
    }
    await this.assertActiveWasher(washerId);

    // Manual override still honours the constraints: the washer must be skilled
    // for this (service, vehicle type) and on an active shift right now.
    await this.assignmentService.assertWasherCanTake(
      washerId,
      wo.service_type_id,
      wo.vehicle_type_id,
    );

    // A washer handles one car at a time. Block the assignment if they are
    // already tied to another work order that is ASSIGNED, IN_PROGRESS or
    // RETURNED (owing a redo).
    const busy = await this.repository.findActiveByWasher(washerId, id);
    if (busy.length > 0) {
      throw new ConflictException(
        `Washer is already handling work order ${busy[0].code} and cannot take another job`,
      );
    }

    const updated = await this.repository.updateById(id, {
      status: WorkOrderStatusEnum.ASSIGNED,
      assignedWasherId: new Types.ObjectId(washerId),
      assignedBy: new Types.ObjectId(actorId),
    });
    if (!updated) throw new NotFoundException('Work order not found');
    this.logger.log(
      `Work order ${updated.code} assigned to washer ${washerId}`,
    );
    return WorkOrderResponseDto.fromDocument(updated);
  }

  /** Quality check. Pass → DONE + order COMPLETED; fail → RETURNED to washer. */
  async qualityCheck(
    id: string,
    dto: QcWorkOrderDto,
    actorId: string,
  ): Promise<WorkOrderResponseDto> {
    const wo = await this.requireWorkOrder(id);
    if (wo.status !== WorkOrderStatusEnum.QUALITY_CHECK) {
      throw new BadRequestException(
        `QC only applies to work orders awaiting quality check (current status: ${wo.status})`,
      );
    }

    if (dto.passed) {
      const updated = await this.repository.updateById(id, {
        status: WorkOrderStatusEnum.DONE,
        qcBy: new Types.ObjectId(actorId),
        qcAt: new Date(),
        qcPassed: true,
        qcNote: dto.note,
      });
      if (!updated) throw new NotFoundException('Work order not found');
      await this.completeOrder(wo.order_id);
      this.logger.log(`Work order ${updated.code} QC passed → DONE`);
      return WorkOrderResponseDto.fromDocument(updated);
    }

    const updated = await this.repository.updateById(id, {
      status: WorkOrderStatusEnum.RETURNED,
      qcBy: new Types.ObjectId(actorId),
      qcAt: new Date(),
      qcPassed: false,
      qcNote: dto.note,
      returnCount: wo.return_count + 1,
    });
    if (!updated) throw new NotFoundException('Work order not found');
    this.logger.log(`Work order ${updated.code} QC failed → RETURNED`);
    return WorkOrderResponseDto.fromDocument(updated);
  }

  // ---------- WASHER ----------

  async listForWasher(washerId: string): Promise<WorkOrderResponseDto[]> {
    const docs = await this.repository.findByAssignedWasher(washerId);
    return docs.map((d) => WorkOrderResponseDto.fromDocument(d));
  }

  async getForWasher(
    washerId: string,
    id: string,
  ): Promise<WorkOrderResponseDto> {
    const doc = await this.requireAssignedToWasher(id, washerId);
    return WorkOrderResponseDto.fromDocument(doc);
  }

  /** Washer starts the wash. ASSIGNED or RETURNED → IN_PROGRESS. */
  async start(washerId: string, id: string): Promise<WorkOrderResponseDto> {
    const wo = await this.requireAssignedToWasher(id, washerId);
    if (
      wo.status !== WorkOrderStatusEnum.ASSIGNED &&
      wo.status !== WorkOrderStatusEnum.RETURNED
    ) {
      throw new BadRequestException(
        `Cannot start a work order in status ${wo.status}`,
      );
    }

    const updated = await this.repository.updateById(id, {
      status: WorkOrderStatusEnum.IN_PROGRESS,
      startedAt: wo.started_at ?? new Date(),
    });
    if (!updated) throw new NotFoundException('Work order not found');
    await this.orderRepository.updateById(wo.order_id, {
      status: OrderStatusEnum.IN_PROGRESS,
    });
    this.logger.log(`Work order ${updated.code} started by washer ${washerId}`);
    return WorkOrderResponseDto.fromDocument(updated);
  }

  /** Washer finishes the wash. IN_PROGRESS → QUALITY_CHECK. */
  async finish(washerId: string, id: string): Promise<WorkOrderResponseDto> {
    const wo = await this.requireAssignedToWasher(id, washerId);
    if (wo.status !== WorkOrderStatusEnum.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot finish a work order in status ${wo.status}`,
      );
    }

    const updated = await this.repository.updateById(id, {
      status: WorkOrderStatusEnum.QUALITY_CHECK,
      finishedAt: new Date(),
    });
    if (!updated) throw new NotFoundException('Work order not found');
    this.logger.log(
      `Work order ${updated.code} finished by washer ${washerId} → QC`,
    );

    // The washer is free again (QUALITY_CHECK does not tie them up) → hand them
    // the next car in the FIFO queue they are skilled for. Best-effort.
    try {
      await this.assignmentService.tryPullNextForWasher(washerId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Pull-next after finish failed: ${msg}`);
    }
    return WorkOrderResponseDto.fromDocument(updated);
  }

  // ---------- helpers ----------

  private async requireWorkOrder(id: string): Promise<WorkOrderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Work order not found');
    }
    const doc = await this.repository.findById(id);
    if (!doc) throw new NotFoundException('Work order not found');
    return doc;
  }

  /** Loads a work order and verifies it belongs to this washer (404 if not). */
  private async requireAssignedToWasher(
    id: string,
    washerId: string,
  ): Promise<WorkOrderDocument> {
    const doc = await this.requireWorkOrder(id);
    if (doc.assigned_washer_id?.toString() !== washerId) {
      throw new NotFoundException('Work order not found');
    }
    return doc;
  }

  private async assertActiveWasher(washerId: string): Promise<void> {
    if (!Types.ObjectId.isValid(washerId)) {
      throw new BadRequestException('Invalid washerId');
    }
    const user = await this.userRepository.findById(washerId);
    if (!user || !user.is_active) {
      throw new BadRequestException('Washer not found or inactive');
    }
    const role = await this.roleRepository.findById(user.role_id);
    if (!role || role.code !== RoleEnum.WASHER) {
      throw new BadRequestException(
        'washerId must belong to a user with role=washer',
      );
    }
  }

  /**
   * Moves the order to COMPLETED via OrderService so the loyalty earn hook,
   * shift-slot release, and audit transaction stay in one place.
   */
  private async completeOrder(orderId: Types.ObjectId): Promise<void> {
    await this.orderService.markCompletedByWorkOrder(orderId);
  }

  /** Generates a daily-sequential ticket code like WO-20260522-001. */
  private async generateCode(): Promise<string> {
    const now = new Date();
    const day =
      `${now.getUTCFullYear()}` +
      `${String(now.getUTCMonth() + 1).padStart(2, '0')}` +
      `${String(now.getUTCDate()).padStart(2, '0')}`;
    const seq = await this.redis.incr(`seq:wo:${day}`);
    if (seq === 1) {
      await this.redis.expire(`seq:wo:${day}`, 60 * 60 * 24 * 2);
    }
    return `WO-${day}-${String(seq).padStart(3, '0')}`;
  }
}

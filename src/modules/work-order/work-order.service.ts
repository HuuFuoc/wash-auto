import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions';
import { redisClient } from '../../core/redis';
import { RealtimeEvent, emitToManagers, emitToUser } from '../../core/realtime';
import { QueryWorkOrderDto } from '../../shared/work-order/dto/query-work-order.dto';
import {
  WorkOrderListResponseDto,
  WorkOrderResponseDto,
} from '../../shared/work-order/dto/work-order-response.dto';
import { WorkOrderStatusEnum } from '../../shared/work-order/types/work-order-status.enum';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';
import { PaymentMethodEnum } from '../../shared/order/types/payment-method.enum';
import { PaymentStatusEnum } from '../../shared/order/types/payment-status.enum';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { OrderRepository } from '../order/order.repository';
import { OrderService } from '../order/order.service';
import { ServiceTypeRepository } from '../service-type/service-type.repository';
import { StaffShiftRepository } from '../staff-shift/staff-shift.repository';
import { VehicleTypeRepository } from '../vehicle-type/vehicle-type.repository';
import { VehicleRepository } from '../vehicle/vehicle.repository';
import { AssignmentService } from './assignment.service';
import { WorkOrderDocument } from './work-order.model';
import {
  IWorkOrderListFilter,
  WorkOrderRepository,
} from './work-order.repository';

// Business logic copied verbatim from features/work-order/work-order.service.ts;
// only DI (REDIS_CLIENT) + Nest exceptions + Logger were swapped out.
export class WorkOrderService {
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
  ) {}

  // ---------- CASHIER / MANAGER ----------

  /**
   * Cashier check-in: turns a confirmed order into a job ticket. Creates the
   * work order (WAITING) and moves the order CONFIRMED → CHECKED_IN.
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
      serviceTypeId: order.service_type_id,
      vehicleTypeId: vehicle.vehicle_type_id,
      scheduledAt: order.scheduled_at,
      preferredWasherId: shift?.staff_id,
      checkinPhotos,
      estimatedMinutes:
        order.estimated_minutes > 0
          ? order.estimated_minutes
          : service.estimated_minutes,
      stationName: shift?.station_name,
    });

    const settlesCash =
      order.payment_method === PaymentMethodEnum.CASH &&
      order.payment_status !== PaymentStatusEnum.PAID;
    await this.orderRepository.updateById(order._id, {
      status: OrderStatusEnum.CHECKED_IN,
      ...(settlesCash ? { paymentStatus: PaymentStatusEnum.PAID } : {}),
    });

    console.log(
      `Work order ${created.code} created for order ${orderId} by ${actorId}`,
    );

    let finalWo = created;
    try {
      await this.assignmentService.tryAutoAssign(created);
      finalWo = (await this.repository.findById(created._id)) ?? created;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
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

    await this.assignmentService.assertWasherCanTake(washerId);

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
    console.log(`Work order ${updated.code} assigned to washer ${washerId}`);
    const dto = WorkOrderResponseDto.fromDocument(updated);
    emitToUser(washerId, RealtimeEvent.WASH_ASSIGNED, dto);
    await this.emitWashEvent(
      updated.order_id,
      RealtimeEvent.WASH_ASSIGNED,
      dto,
    );
    return dto;
  }

  // ---------- CUSTOMER ----------

  /**
   * Customer view of "who is/was washing my car": returns the work order for an
   * order the customer owns, with the assigned washer's name populated.
   */
  async getForCustomerByOrder(
    customerId: string,
    orderId: string,
  ): Promise<WorkOrderResponseDto> {
    if (!Types.ObjectId.isValid(orderId)) {
      throw new NotFoundException('Order not found');
    }
    const order = await this.orderRepository.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');
    if (order.customer_id.toString() !== customerId) {
      throw new ForbiddenException('You can only view your own order');
    }
    const wo = await this.repository.findByOrderIdWithWasher(order._id);
    if (!wo) {
      throw new NotFoundException(
        'No work order has been created for this order yet',
      );
    }
    return WorkOrderResponseDto.fromDocument(wo);
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

  /** Washer starts the wash. ASSIGNED → IN_PROGRESS. */
  async start(washerId: string, id: string): Promise<WorkOrderResponseDto> {
    const wo = await this.requireAssignedToWasher(id, washerId);
    if (wo.status !== WorkOrderStatusEnum.ASSIGNED) {
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
    console.log(`Work order ${updated.code} started by washer ${washerId}`);
    const dto = WorkOrderResponseDto.fromDocument(updated);
    await this.emitWashEvent(updated.order_id, RealtimeEvent.WASH_STARTED, dto);
    return dto;
  }

  /**
   * Washer finishes the wash. IN_PROGRESS → DONE (≥1 photo required). With
   * manager QC removed, finishing the wash completes the order directly
   * (loyalty hook runs in OrderService.markCompletedByWorkOrder).
   */
  async finish(
    washerId: string,
    id: string,
    checkoutPhotos: string[],
  ): Promise<WorkOrderResponseDto> {
    const wo = await this.requireAssignedToWasher(id, washerId);
    if (wo.status !== WorkOrderStatusEnum.IN_PROGRESS) {
      throw new BadRequestException(
        `Cannot finish a work order in status ${wo.status}`,
      );
    }
    if (!checkoutPhotos || checkoutPhotos.length === 0) {
      throw new BadRequestException(
        'At least one post-wash photo is required to finish the wash',
      );
    }

    const updated = await this.repository.updateById(id, {
      status: WorkOrderStatusEnum.DONE,
      finishedAt: new Date(),
      checkoutPhotos,
    });
    if (!updated) throw new NotFoundException('Work order not found');
    await this.completeOrder(wo.order_id);
    console.log(
      `Work order ${updated.code} finished by washer ${washerId} → DONE`,
    );

    try {
      await this.assignmentService.tryPullNextForWasher(washerId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Pull-next after finish failed: ${msg}`);
    }
    const dto = WorkOrderResponseDto.fromDocument(updated);
    await this.emitWashEvent(
      updated.order_id,
      RealtimeEvent.WASH_COMPLETED,
      dto,
    );
    return dto;
  }

  // ---------- helpers ----------

  /** Best-effort realtime fan-out: managers' ops feed + the order's customer. */
  private async emitWashEvent(
    orderId: Types.ObjectId,
    event: string,
    payload: WorkOrderResponseDto,
  ): Promise<void> {
    emitToManagers(event, payload);
    try {
      const order = await this.orderRepository.findById(orderId);
      if (order?.customer_id) {
        emitToUser(order.customer_id.toString(), event, payload);
      }
    } catch {
      // Realtime is best-effort; never fail the wash flow on emit errors.
    }
  }

  private async requireWorkOrder(id: string): Promise<WorkOrderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Work order not found');
    }
    const doc = await this.repository.findById(id);
    if (!doc) throw new NotFoundException('Work order not found');
    return doc;
  }

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

  /** Moves the order to COMPLETED via OrderService (loyalty hook lives there). */
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
    const seq = await redisClient.incr(`seq:wo:${day}`);
    if (seq === 1) {
      await redisClient.expire(`seq:wo:${day}`, 60 * 60 * 24 * 2);
    }
    return `WO-${day}-${String(seq).padStart(3, '0')}`;
  }
}

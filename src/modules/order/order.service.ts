import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions';
import { config } from '../../config';
import { redisClient } from '../../core/redis';
import { RealtimeEvent, emitToManagers } from '../../core/realtime';
import { AvailableSlotDto } from '../../shared/order/dto/available-slot.dto';
import { CancelOrderDto } from '../../shared/order/dto/cancel-order.dto';
import { CreateOrderDto } from '../../shared/order/dto/create-order.dto';
import { GetWasherScheduleQueryDto } from '../../shared/order/dto/get-washer-schedule-query.dto';
import {
  OrderListResponseDto,
  OrderResponseDto,
  OrderWasherView,
} from '../../shared/order/dto/order-response.dto';
import {
  PreviewOrderDto,
  PreviewOrderResponseDto,
} from '../../shared/order/dto/preview-order.dto';
import { QueryAvailableSlotsDto } from '../../shared/order/dto/query-available-slots.dto';
import { QueryOrderDto } from '../../shared/order/dto/query-order.dto';
import { RescheduleOrderDto } from '../../shared/order/dto/reschedule-order.dto';
import { UpdateOrderStatusDto } from '../../shared/order/dto/update-order-status.dto';
import { WasherScheduleItemDto } from '../../shared/order/dto/washer-schedule-item.dto';
import {
  isCancellableByOwner,
  isValidOrderTransition,
} from '../../shared/order/order.state-machine';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';
import { PaymentMethodEnum } from '../../shared/order/types/payment-method.enum';
import { PaymentStatusEnum } from '../../shared/order/types/payment-status.enum';
import { ShiftStatusEnum } from '../../shared/staff-shift/types/shift-status.enum';
import { ShiftTypeEnum } from '../../shared/staff-shift/types/shift-type.enum';
import { UserRepository } from '../auth/user.repository';
import { EmailService } from '../email/email.service';
import { GoldenHourService } from '../golden-hour/golden-hour.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PricingPolicyService } from '../pricing-policy/pricing-policy.service';
import { ServiceTypeDocument } from '../service-type/service-type.model';
import { ServiceTypeRepository } from '../service-type/service-type.repository';
import { StaffShiftRepository } from '../staff-shift/staff-shift.repository';
import { TierConfigDocument } from '../tier-config/tier-config.model';
import { TierConfigRepository } from '../tier-config/tier-config.repository';
import { VehicleDocument } from '../vehicle/vehicle.model';
import { VehicleRepository } from '../vehicle/vehicle.repository';
import { VehicleService } from '../vehicle/vehicle.service';
import { VoucherService } from '../voucher/voucher.service';
import { FeedbackRepository } from '../feedback/feedback.repository';
import { WorkOrderRepository } from '../work-order/work-order.repository';
import { OrderDocument } from './order.model';
import { IOrderListFilter, OrderRepository } from './order.repository';
import { PaymentTransactionRepository } from './payment-transaction.repository';
import { PayosService } from './payos.service';

const TXN_DEDUP_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_SLOT_RANGE_MS = 31 * 24 * 60 * 60 * 1000; // slot query cap

/**
 * Golden-hour window discount + tier discount, clamped to the admin-configured
 * pricing-policy cap. The voucher path stacks after this with its own VND cap.
 */
function stackedDiscountPercent(
  windowDiscountPercent: number,
  tierDiscountPercent: number,
  capPercent: number,
): number {
  return Math.min(windowDiscountPercent + tierDiscountPercent, capPercent);
}

/** First instant of a YYYY-MM-DD calendar day, in UTC. */
function startOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00.000Z`);
}

/** Last instant of a YYYY-MM-DD calendar day, in UTC. */
function endOfUtcDay(dateStr: string): Date {
  return new Date(`${dateStr}T23:59:59.999Z`);
}

/**
 * Resolves a washer-schedule query into a scheduled_at window. A `from`/`to`
 * range overrides a single `date`; with neither, the window opens at the start
 * of today (UTC) and stays open-ended.
 */
function resolveScheduleRange(query: GetWasherScheduleQueryDto): {
  scheduledFrom?: Date;
  scheduledTo?: Date;
} {
  const { date, from, to } = query;
  if (from || to) {
    if (from && to && from > to) {
      throw new BadRequestException('`from` must not be after `to`');
    }
    return {
      scheduledFrom: from ? startOfUtcDay(from) : undefined,
      scheduledTo: to ? endOfUtcDay(to) : undefined,
    };
  }
  if (date) {
    return {
      scheduledFrom: startOfUtcDay(date),
      scheduledTo: endOfUtcDay(date),
    };
  }
  const todayStr = new Date().toISOString().slice(0, 10);
  return { scheduledFrom: startOfUtcDay(todayStr) };
}

// Office hours the shop offers bookings for, in Vietnam local time (UTC+7):
// 08:00–12:00 morning and 14:00–17:00 afternoon (midday break in between).
const VN_UTC_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const BUSINESS_HOUR_WINDOWS: ReadonlyArray<readonly [number, number]> = [
  [8 * 60, 12 * 60],
  [14 * 60, 17 * 60],
];

/**
 * True when the service interval [slotMs, slotMs + durationMs] fits entirely
 * inside one office-hour window, read in Vietnam local time.
 */
function fitsBusinessHours(slotMs: number, durationMs: number): boolean {
  const startMin = ((slotMs + VN_UTC_OFFSET_MS) % DAY_MS) / 60_000;
  const endMin = startMin + durationMs / 60_000;
  return BUSINESS_HOUR_WINDOWS.some(
    ([open, close]) => startMin >= open && endMin <= close,
  );
}

/** Extracts the assigned-washer summary from a work order (washer may be populated). */
function washerEntry(wo: { assigned_washer_id?: unknown; status: string }): {
  washerId?: string;
  washerName?: string;
  status?: string;
} {
  const washer = wo.assigned_washer_id;
  if (washer && typeof washer === 'object' && '_id' in washer) {
    const w = washer as { _id: Types.ObjectId; name?: string };
    return {
      washerId: w._id.toString(),
      washerName: w.name,
      status: wo.status,
    };
  }
  return {
    washerId: (washer as Types.ObjectId | undefined)?.toString(),
    status: wo.status,
  };
}

/**
 * Builds the customer-facing washer card for an order: who washed it, their
 * phone + overall rating, and whether the customer can/already left feedback.
 */
export function customerWasherView(
  workOrder: { assigned_washer_id?: unknown; status: string } | undefined,
  ratingByWasher: Map<string, { averageRating: number }>,
  orderRatings: Map<string, number>,
  orderId: string,
  orderStatus: OrderStatusEnum,
): OrderWasherView {
  const orderRating = orderRatings.get(orderId);
  const alreadyRated = orderRating !== undefined;
  if (!workOrder) {
    return { orderRating, canRate: false, alreadyRated };
  }
  const washer = workOrder.assigned_washer_id;
  let washerId: string | undefined;
  let washerName: string | undefined;
  let washerPhone: string | undefined;
  if (washer && typeof washer === 'object' && '_id' in washer) {
    const w = washer as { _id: Types.ObjectId; name?: string; phone?: string };
    washerId = w._id.toString();
    washerName = w.name;
    washerPhone = w.phone;
  } else if (washer) {
    washerId = (washer as Types.ObjectId).toString();
  }
  return {
    washerId,
    washerName,
    washerPhone,
    washerAvgRating: washerId
      ? (ratingByWasher.get(washerId)?.averageRating ?? 0)
      : undefined,
    orderRating,
    status: workOrder.status,
    alreadyRated,
    canRate:
      orderStatus === OrderStatusEnum.COMPLETED && !!washerId && !alreadyRated,
  };
}

// Business logic copied verbatim from features/order/services/order.service.ts;
// only DI (ConfigService/REDIS_CLIENT) + Nest exceptions + Logger were swapped.
export class OrderService {
  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly transactionRepository: PaymentTransactionRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly vehicleService: VehicleService,
    private readonly serviceTypeRepository: ServiceTypeRepository,
    private readonly staffShiftRepository: StaffShiftRepository,
    private readonly userRepository: UserRepository,
    private readonly tierConfigRepository: TierConfigRepository,
    private readonly loyaltyService: LoyaltyService,
    private readonly voucherService: VoucherService,
    private readonly goldenHourService: GoldenHourService,
    private readonly payosService: PayosService,
    private readonly emailService: EmailService,
    private readonly pricingPolicyService: PricingPolicyService,
    private readonly workOrderRepository: WorkOrderRepository,
    private readonly feedbackRepository: FeedbackRepository,
  ) {}

  /**
   * Resolves the active price + duration for a (service, vehicle type) pair from
   * the service's per-vehicle pricing board. Throws 400 when no active cell
   * exists. The service-level base_price/estimated_minutes are NOT a fallback.
   */
  private resolvePricingCell(
    service: ServiceTypeDocument,
    vehicleTypeId: string,
  ): { price: number; estimatedMinutes: number } {
    const cell = (service.vehicle_pricing ?? []).find(
      (p) => p.is_active && p.vehicle_type_id.toString() === vehicleTypeId,
    );
    if (!cell) {
      throw new BadRequestException('Dịch vụ không áp dụng cho loại xe này');
    }
    return {
      price: Math.round(parseFloat(cell.price.toString())),
      estimatedMinutes: cell.estimated_minutes,
    };
  }

  // ---------- CUSTOMER ----------

  async createOrder(
    customerId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const hasSavedVehicle = !!dto.vehicleId;
    const hasInlineVehicle = !!dto.vehicle;
    if (hasSavedVehicle === hasInlineVehicle) {
      throw new BadRequestException(
        'Provide exactly one of `vehicleId` (saved vehicle) or ' +
          '`vehicle` (new vehicle details)',
      );
    }

    const service = await this.serviceTypeRepository.findById(
      dto.serviceTypeId,
    );
    if (!service || !service.is_active) {
      throw new BadRequestException('Service type not found or inactive');
    }

    let savedVehicle: VehicleDocument | undefined;
    let vehicleTypeId: string;
    if (dto.vehicleId) {
      const vehicle = await this.vehicleRepository.findByIdForOwner(
        dto.vehicleId,
        customerId,
      );
      if (!vehicle || !vehicle.is_active) {
        throw new NotFoundException('Vehicle not found');
      }
      savedVehicle = vehicle;
      vehicleTypeId = vehicle.vehicle_type_id.toString();
    } else {
      vehicleTypeId = dto.vehicle!.vehicleTypeId;
    }
    const cell = this.resolvePricingCell(service, vehicleTypeId);

    if (dto.scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    const loyaltyAccount =
      await this.loyaltyService.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      loyaltyAccount.tier_config_id,
    );
    if (!tier) {
      throw new BadRequestException('Tier config missing for this customer');
    }
    const maxScheduledMs =
      Date.now() + tier.booking_window_days * 24 * 60 * 60 * 1000;
    if (dto.scheduledAt.getTime() > maxScheduledMs) {
      throw new BadRequestException(
        `scheduledAt exceeds your tier booking window (${tier.booking_window_days} days)`,
      );
    }

    const maxActive = config.booking.maxActivePerCustomer;
    const active = await this.orderRepository.countActiveByCustomer(customerId);
    if (active >= maxActive) {
      throw new BadRequestException(
        `You already have ${active} active orders (limit ${maxActive})`,
      );
    }

    const candidates = await this.staffShiftRepository.findShiftsContaining(
      dto.scheduledAt,
      cell.estimatedMinutes,
    );
    if (candidates.length === 0) {
      throw new ConflictException(
        'No shift covers this time, or all shifts are full',
      );
    }
    const wantStartMs = dto.scheduledAt.getTime();
    const wantEndMs = wantStartMs + cell.estimatedMinutes * 60_000;
    const concurrencyByShift = await this.countConcurrentByShift(
      candidates.map((c) => c._id),
      wantStartMs,
      wantEndMs,
    );
    let reservedShiftId: Types.ObjectId | undefined;
    for (const candidate of candidates) {
      const busy = concurrencyByShift.get(candidate._id.toString()) ?? 0;
      if (busy >= 1) continue;
      reservedShiftId = candidate._id;
      break;
    }
    if (!reservedShiftId) {
      throw new ConflictException('All shifts at this time are full');
    }

    let vehicleObjId: Types.ObjectId;
    let createdVehicleId: Types.ObjectId | undefined;
    if (savedVehicle) {
      vehicleObjId = savedVehicle._id;
    } else {
      const created = await this.vehicleService.createOwn(
        customerId,
        dto.vehicle!,
      );
      vehicleObjId = new Types.ObjectId(created.id);
      createdVehicleId = vehicleObjId;
    }

    const originalAmount = cell.price;
    const pricing = await this.computeOrderPricing(
      dto.scheduledAt,
      tier,
      originalAmount,
    );

    let voucherDoc: Awaited<
      ReturnType<VoucherService['consumeFreeWashForOrder']>
    > | null = null;
    let amount = pricing.amount;
    let discountAmount = pricing.discountAmount;
    let discountPercent = pricing.discountPercent;
    let discountReason: string | undefined = pricing.discountReason;
    let voucherIdObj: Types.ObjectId | undefined;
    const isOnline = dto.paymentMethod === PaymentMethodEnum.ONLINE;
    const initialStatus = isOnline
      ? OrderStatusEnum.PENDING_PAYMENT
      : OrderStatusEnum.CONFIRMED;
    const initialPaymentStatus = PaymentStatusEnum.UNPAID;

    let order: OrderDocument;
    try {
      if (dto.voucherId) {
        if (!service.is_voucher_eligible) {
          throw new BadRequestException(
            `Service "${service.name}" does not accept vouchers`,
          );
        }

        const tmpOrderId = new Types.ObjectId();
        voucherDoc = await this.voucherService.consumeFreeWashForOrder(
          dto.voucherId,
          customerId,
          tmpOrderId,
        );
        voucherIdObj = voucherDoc._id;

        const remaining = Math.max(0, originalAmount - discountAmount);
        const voucherDiscount = Math.min(
          remaining,
          voucherDoc.discount_cap_vnd,
        );
        discountAmount = discountAmount + voucherDiscount;
        amount = Math.max(0, originalAmount - discountAmount);
        discountPercent =
          originalAmount > 0
            ? Math.round((discountAmount / originalAmount) * 100)
            : 0;
        discountReason = discountReason
          ? `${discountReason}+voucher:${voucherDoc.code}`
          : `voucher:${voucherDoc.code}`;

        if (isOnline && amount === 0) {
          throw new BadRequestException(
            'Order total is 0 VND after discounts - please pay in cash at the counter',
          );
        }
      }

      const payosOrderCode = isOnline
        ? await this.generateOrderCode()
        : undefined;
      order = await this.orderRepository.create({
        customerId: new Types.ObjectId(customerId),
        vehicleId: vehicleObjId,
        serviceTypeId: new Types.ObjectId(dto.serviceTypeId),
        staffShiftId: reservedShiftId,
        scheduledAt: dto.scheduledAt,
        estimatedMinutes: cell.estimatedMinutes,
        priorityLevel: tier.priority_level,
        paymentMethod: dto.paymentMethod,
        paymentStatus: initialPaymentStatus,
        status: initialStatus,
        amount,
        originalAmount,
        discountAmount,
        discountPercent,
        discountReason,
        voucherId: voucherIdObj,
        note: dto.note,
        payosOrderCode,
      });
    } catch (err) {
      if (createdVehicleId) {
        await this.rollbackInlineVehicle(createdVehicleId);
      }
      if (voucherDoc) {
        await this.voucherService.refund(voucherDoc._id);
      }
      throw err;
    }

    if (isOnline && order.payos_order_code) {
      const returnUrl = config.payos.returnUrl;
      const cancelUrl = config.payos.cancelUrl;
      const description = `Rua xe ${order.payos_order_code}`;
      try {
        const link = await this.payosService.createPaymentLink({
          orderCode: order.payos_order_code,
          amount,
          description,
          returnUrl,
          cancelUrl,
          items: [{ name: service.name, quantity: 1, price: amount }],
        });
        const updated = await this.orderRepository.updateById(order._id, {
          payosCheckoutUrl: link.checkoutUrl,
          payosPaymentLinkId: link.paymentLinkId,
        });
        if (updated) order = updated;
      } catch (err) {
        await this.orderRepository.updateById(order._id, {
          status: OrderStatusEnum.CANCELLED,
          cancelReason: 'PayOS link creation failed',
        });
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`PayOS createPaymentLink failed: ${msg}`);
        throw new BadRequestException(
          'Failed to create payment link. Please try again.',
        );
      }
    }

    if (dto.paymentMethod === PaymentMethodEnum.CASH) {
      await this.sendConfirmationEmailSafe(order);
    }

    console.log(
      `Order created customerId=${customerId} orderId=${order._id.toString()} method=${dto.paymentMethod}`,
    );
    const result = OrderResponseDto.fromDocument(order);
    emitToManagers(RealtimeEvent.ORDER_CREATED, result);
    return result;
  }

  async listOwn(customerId: string): Promise<OrderResponseDto[]> {
    const docs = await this.orderRepository.findByOwner(customerId);
    const views = await this.buildCustomerWasherViews(docs);
    return docs.map((d) =>
      OrderResponseDto.fromDocument(d, views.get(d._id.toString())),
    );
  }

  async getOwn(customerId: string, id: string): Promise<OrderResponseDto> {
    const doc = await this.requireOwned(id, customerId);
    const views = await this.buildCustomerWasherViews([doc]);
    return OrderResponseDto.fromDocument(doc, views.get(doc._id.toString()));
  }

  /** order_id → washer/rating/feedback-eligibility view for a customer's orders. */
  private async buildCustomerWasherViews(
    docs: OrderDocument[],
  ): Promise<Map<string, OrderWasherView>> {
    const map = new Map<string, OrderWasherView>();
    if (docs.length === 0) return map;
    const orderIds = docs.map((d) => d._id);

    const [workOrders, orderRatings] = await Promise.all([
      this.workOrderRepository.findByOrderIds(orderIds),
      this.feedbackRepository.ratingByOrderIds(orderIds),
    ]);
    const woByOrder = new Map(
      workOrders.map((wo) => [wo.order_id.toString(), wo]),
    );

    const washerIds = [
      ...new Set(
        workOrders
          .map((wo) => {
            const w = wo.assigned_washer_id as unknown;
            if (w && typeof w === 'object' && '_id' in w) {
              return (w as { _id: Types.ObjectId })._id.toString();
            }
            return w ? (w as Types.ObjectId).toString() : undefined;
          })
          .filter((id): id is string => !!id),
      ),
    ];
    const ratingByWasher =
      await this.feedbackRepository.summaryByWashers(washerIds);

    for (const doc of docs) {
      const id = doc._id.toString();
      map.set(
        id,
        customerWasherView(
          woByOrder.get(id),
          ratingByWasher,
          orderRatings,
          id,
          doc.status,
        ),
      );
    }
    return map;
  }

  /**
   * Pricing breakdown a customer would see if they posted the same
   * (service, time, voucher) tuple now. No side effects: voucher NOT consumed.
   */
  async previewOrder(
    customerId: string,
    dto: PreviewOrderDto,
  ): Promise<PreviewOrderResponseDto> {
    const service = await this.serviceTypeRepository.findById(
      dto.serviceTypeId,
    );
    if (!service || !service.is_active) {
      throw new BadRequestException('Service type not found or inactive');
    }

    const loyaltyAccount =
      await this.loyaltyService.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      loyaltyAccount.tier_config_id,
    );
    if (!tier) {
      throw new BadRequestException('Tier config missing for this customer');
    }

    const cell = this.resolvePricingCell(service, dto.vehicleTypeId);
    const originalAmount = cell.price;
    const pricing = await this.computeOrderPricing(
      dto.scheduledAt,
      tier,
      originalAmount,
    );

    let discountAmount = pricing.discountAmount;
    let discountReason = pricing.discountReason;
    let voucherDiscountCapVnd: number | undefined;
    let voucherError: string | undefined;

    if (dto.voucherId) {
      const voucher = await this.voucherService.findRedeemableForCustomer(
        dto.voucherId,
        customerId,
      );
      if (!voucher) {
        voucherError = 'Voucher not found, not owned, expired, or already used';
      } else if (!service.is_voucher_eligible) {
        voucherDiscountCapVnd = voucher.discount_cap_vnd;
        voucherError = `Service "${service.name}" does not accept vouchers`;
      } else {
        voucherDiscountCapVnd = voucher.discount_cap_vnd;
        const remaining = Math.max(0, originalAmount - discountAmount);
        const voucherDiscount = Math.min(remaining, voucher.discount_cap_vnd);
        discountAmount += voucherDiscount;
        discountReason = discountReason
          ? `${discountReason}+voucher:${voucher.code}`
          : `voucher:${voucher.code}`;
      }
    }

    const amount = Math.max(0, originalAmount - discountAmount);
    const discountPercent =
      originalAmount > 0
        ? Math.round((discountAmount / originalAmount) * 100)
        : 0;
    const isGoldenHour = !!pricing.discountReason;

    return {
      originalAmount,
      estimatedMinutes: cell.estimatedMinutes,
      discountAmount,
      discountPercent,
      discountReason,
      amount,
      isGoldenHour,
      tierName: tier.tier_name,
      tierDiscountPercent: tier.discount_percent,
      voucherDiscountCapVnd,
      voucherError,
    };
  }

  /**
   * Enumerates the discrete start times a customer may book for a given
   * service inside [from, to]. Mirrors createOrder's rule so every slot is
   * one POST /me/orders will accept (barring a concurrent fill).
   */
  async listAvailableSlots(
    customerId: string,
    dto: QueryAvailableSlotsDto,
  ): Promise<AvailableSlotDto[]> {
    if (dto.from.getTime() > dto.to.getTime()) {
      throw new BadRequestException('`from` must be ≤ `to`');
    }
    if (dto.to.getTime() - dto.from.getTime() > MAX_SLOT_RANGE_MS) {
      throw new BadRequestException('Date range too wide (max 31 days)');
    }

    const service = await this.serviceTypeRepository.findById(
      dto.serviceTypeId,
    );
    if (!service || !service.is_active) {
      throw new BadRequestException('Service type not found or inactive');
    }
    const cell = this.resolvePricingCell(service, dto.vehicleTypeId);
    const durationMs = cell.estimatedMinutes * 60_000;

    const nowMs = Date.now();
    const loyaltyAccount =
      await this.loyaltyService.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      loyaltyAccount.tier_config_id,
    );
    if (!tier) {
      throw new BadRequestException('Tier config missing for this customer');
    }
    const tierMaxMs = nowMs + tier.booking_window_days * 24 * 60 * 60 * 1000;

    const windowStartMs = Math.max(dto.from.getTime(), nowMs);
    const windowEndMs = Math.min(dto.to.getTime(), tierMaxMs);
    if (windowStartMs > windowEndMs) return [];

    const shifts = await this.staffShiftRepository.findOverlapping(
      new Date(windowStartMs),
      new Date(windowEndMs),
    );

    const intervalMs = config.booking.slotIntervalMinutes * 60_000;

    const busyWindowsByShift = new Map<string, [number, number][]>();
    const activeOrders = await this.orderRepository.findActiveByShifts(
      shifts.map((s) => s._id),
    );
    for (const o of activeOrders) {
      const shiftId = o.staff_shift_id.toString();
      const startMs = o.scheduled_at.getTime();
      const orderDurationMs =
        o.estimated_minutes > 0 ? o.estimated_minutes * 60_000 : durationMs;
      const list = busyWindowsByShift.get(shiftId) ?? [];
      list.push([startMs, startMs + orderDurationMs]);
      busyWindowsByShift.set(shiftId, list);
    }

    const capacityBySlot = new Map<number, number>();
    for (const shift of shifts) {
      const busyWindows = busyWindowsByShift.get(shift._id.toString()) ?? [];
      const shiftEndMs = shift.end_at.getTime();
      let slotMs =
        Math.ceil(shift.start_at.getTime() / intervalMs) * intervalMs;
      for (; slotMs + durationMs <= shiftEndMs; slotMs += intervalMs) {
        if (slotMs < windowStartMs || slotMs > windowEndMs) continue;
        if (!fitsBusinessHours(slotMs, durationMs)) continue;
        const slotEndMs = slotMs + durationMs;
        let busy = 0;
        for (const [bStart, bEnd] of busyWindows) {
          if (bStart < slotEndMs && slotMs < bEnd) busy++;
        }
        const free = busy > 0 ? 0 : 1;
        if (free <= 0) continue;
        capacityBySlot.set(slotMs, (capacityBySlot.get(slotMs) ?? 0) + free);
      }
    }

    const sortedEntries = [...capacityBySlot.entries()].sort(
      ([a], [b]) => a - b,
    );
    const capPercent =
      await this.pricingPolicyService.getMaxStackedDiscountPercent();
    const annotated = await Promise.all(
      sortedEntries.map(async ([ms, capacity]) => {
        const scheduledAt = new Date(ms);
        const window = await this.goldenHourService.findActiveAt(scheduledAt);
        const slot = new AvailableSlotDto();
        slot.scheduledAt = scheduledAt;
        slot.remainingCapacity = capacity;
        slot.isGoldenHour = !!window;
        slot.discountPercent = window
          ? stackedDiscountPercent(
              window.discount_percent ?? 0,
              tier.discount_percent,
              capPercent,
            )
          : 0;
        return slot;
      }),
    );
    return annotated;
  }

  /**
   * For each given shift, count its active orders whose wash window overlaps
   * [fromMs, toMs). Enforces per-time-slot concurrency (one wash per washer).
   */
  private async countConcurrentByShift(
    shiftIds: Types.ObjectId[],
    fromMs: number,
    toMs: number,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (shiftIds.length === 0) return result;
    const defaultDurationMs = toMs - fromMs;
    const orders = await this.orderRepository.findActiveByShifts(shiftIds);
    for (const o of orders) {
      const startMs = o.scheduled_at.getTime();
      const durMs =
        o.estimated_minutes > 0
          ? o.estimated_minutes * 60_000
          : defaultDurationMs;
      if (startMs < toMs && fromMs < startMs + durMs) {
        const key = o.staff_shift_id.toString();
        result.set(key, (result.get(key) ?? 0) + 1);
      }
    }
    return result;
  }

  async rescheduleOwn(
    customerId: string,
    id: string,
    dto: RescheduleOrderDto,
  ): Promise<OrderResponseDto> {
    const order = await this.requireOwned(id, customerId);
    if (
      order.status !== OrderStatusEnum.PENDING_PAYMENT &&
      order.status !== OrderStatusEnum.CONFIRMED
    ) {
      throw new BadRequestException(
        'Only pending or confirmed orders can be rescheduled',
      );
    }
    const maxReschedules = config.booking.maxReschedules;
    if (order.reschedule_count >= maxReschedules) {
      throw new BadRequestException(
        `Reschedule limit reached (${maxReschedules})`,
      );
    }

    const newShift = await this.staffShiftRepository.findById(dto.staffShiftId);
    if (
      !newShift ||
      newShift.status !== ShiftStatusEnum.SCHEDULED ||
      newShift.shift_type !== ShiftTypeEnum.WASHER
    ) {
      throw new BadRequestException('New shift not available');
    }
    if (
      dto.scheduledAt < newShift.start_at ||
      dto.scheduledAt > newShift.end_at
    ) {
      throw new BadRequestException(
        'scheduledAt is outside the new shift window',
      );
    }

    if (dto.scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('scheduledAt must be in the future');
    }
    let durationMin = order.estimated_minutes;
    if (!(durationMin > 0)) {
      const service = await this.serviceTypeRepository.findById(
        order.service_type_id,
      );
      if (!service) {
        throw new BadRequestException('Original service type missing');
      }
      durationMin = service.estimated_minutes;
    }
    const finishMs = dto.scheduledAt.getTime() + durationMin * 60_000;
    if (finishMs > newShift.end_at.getTime()) {
      throw new BadRequestException(
        `Service requires ${durationMin} min and would overrun the new shift end`,
      );
    }

    const concurrency = await this.countConcurrentByShift(
      [new Types.ObjectId(dto.staffShiftId)],
      dto.scheduledAt.getTime(),
      finishMs,
    );
    if ((concurrency.get(dto.staffShiftId) ?? 0) >= 1) {
      throw new ConflictException('New shift is full at this time');
    }

    const updated = await this.orderRepository.applyReschedule(
      id,
      new Types.ObjectId(dto.staffShiftId),
      dto.scheduledAt,
    );
    if (!updated) throw new NotFoundException('Order not found');
    console.log(
      `Order rescheduled orderId=${id} newShiftId=${dto.staffShiftId}`,
    );
    return OrderResponseDto.fromDocument(updated);
  }

  async cancelOwn(
    customerId: string,
    id: string,
    dto: CancelOrderDto,
  ): Promise<OrderResponseDto> {
    const order = await this.requireOwned(id, customerId);
    if (!isCancellableByOwner(order.status)) {
      throw new BadRequestException(
        `Order in status ${order.status} cannot be cancelled by customer`,
      );
    }

    if (
      order.payment_method === PaymentMethodEnum.ONLINE &&
      order.status === OrderStatusEnum.PENDING_PAYMENT &&
      order.payos_order_code
    ) {
      try {
        await this.payosService.cancelPaymentLink(
          order.payos_order_code,
          'Customer cancelled',
        );
      } catch {
        // PayOS may have already expired the link.
      }
    }

    const updated = await this.orderRepository.updateById(id, {
      status: OrderStatusEnum.CANCELLED,
      cancelReason: dto.reason ?? 'Cancelled by customer',
    });
    if (!updated) throw new NotFoundException('Order not found');
    await this.refundVoucherIfPresent(updated);
    return OrderResponseDto.fromDocument(updated);
  }

  // ---------- WEBHOOK ----------

  /**
   * PayOS webhook handler. Idempotency layers: signature verify, Redis SETNX on
   * transaction reference (30d), Redis per-order lock (10s), unique sparse index.
   */
  async handleWebhook(body: unknown): Promise<void> {
    let webhookData: Awaited<
      ReturnType<typeof this.payosService.verifyWebhookData>
    >;
    try {
      webhookData = await this.payosService.verifyWebhookData(
        body as Parameters<typeof this.payosService.verifyWebhookData>[0],
      );
    } catch {
      console.warn('Invalid PayOS webhook signature received');
      return;
    }

    const { orderCode, amount, transactionDateTime, reference, code, desc } =
      webhookData;

    if (reference) {
      const dedupKey = `payos:txn:${reference}`;
      const claimed = await redisClient.set(
        dedupKey,
        '1',
        'EX',
        TXN_DEDUP_TTL_SECONDS,
        'NX',
      );
      if (claimed === null) {
        console.log(
          `Webhook replay ignored reference=${reference} orderCode=${String(orderCode)}`,
        );
        return;
      }
    }

    const lockKey = `lock:order:${orderCode}`;
    const lockAcquired = await redisClient.set(lockKey, '1', 'EX', 10, 'NX');
    if (lockAcquired === null) {
      console.warn(
        `Webhook lock contention orderCode=${String(orderCode)} - PayOS will retry`,
      );
      return;
    }

    try {
      const order = await this.orderRepository.findByPayosOrderCode(
        Number(orderCode),
      );
      if (!order) {
        console.warn(
          `Webhook received for unknown orderCode=${String(orderCode)}`,
        );
        return;
      }

      const isPaid = code === '00';
      if (order.status === OrderStatusEnum.PENDING_PAYMENT) {
        if (isPaid) {
          const updated = await this.orderRepository.updateById(order._id, {
            status: OrderStatusEnum.CONFIRMED,
            paymentStatus: PaymentStatusEnum.PAID,
          });
          if (updated) {
            await this.sendConfirmationEmailSafe(updated);
          }
        } else {
          const cancelled = await this.orderRepository.updateById(order._id, {
            status: OrderStatusEnum.CANCELLED,
            cancelReason: 'Payment failed',
          });
          if (cancelled) await this.refundVoucherIfPresent(cancelled);
        }
      }

      try {
        await this.transactionRepository.create({
          orderId: order._id,
          orderCode: Number(orderCode),
          amount: Number(amount),
          status: desc ?? code,
          payosTransactionId: reference,
          transactionDatetime: transactionDateTime
            ? new Date(transactionDateTime)
            : undefined,
          rawData: body as Record<string, unknown>,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (/E11000|duplicate key/i.test(msg)) {
          console.log(
            `Webhook duplicate transaction insert ignored reference=${reference ?? ''}`,
          );
        } else {
          throw err;
        }
      }

      console.log(
        `Webhook processed orderCode=${String(orderCode)} paid=${isPaid} orderId=${order._id.toString()}`,
      );
    } finally {
      await redisClient.del(lockKey);
    }
  }

  // ---------- STAFF / ADMIN ----------

  async adminList(query: QueryOrderDto): Promise<OrderListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: IOrderListFilter = {
      status: query.status,
      paymentMethod: query.paymentMethod,
      paymentStatus: query.paymentStatus,
      scheduledFrom: query.scheduledFrom,
      scheduledTo: query.scheduledTo,
    };

    if (query.customerId) {
      filter.customerId = new Types.ObjectId(query.customerId);
    }

    if (query.customerPhone) {
      const customerIds = await this.userRepository.findIdsByPhoneLike(
        query.customerPhone,
      );
      if (customerIds.length === 0) {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      filter.customerIds = customerIds;
    }

    if (query.vehicleLicensePlate) {
      const vehicleIds = await this.vehicleRepository.findIdsByLicensePlateLike(
        query.vehicleLicensePlate,
      );
      if (vehicleIds.length === 0) {
        return { data: [], meta: { page, limit, total: 0, totalPages: 0 } };
      }
      filter.vehicleIds = vehicleIds;
    }

    const [docs, total] = await Promise.all([
      this.orderRepository.findPaginated(filter, page, limit),
      this.orderRepository.countMatching(filter),
    ]);
    const washerMap = await this.buildWasherMap(docs.map((d) => d._id));
    return {
      data: docs.map((d) =>
        OrderResponseDto.fromDocument(d, washerMap.get(d._id.toString())),
      ),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async adminGetOne(id: string): Promise<OrderResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Order not found');
    }
    const doc = await this.orderRepository.findById(id);
    if (!doc) throw new NotFoundException('Order not found');
    const wo = await this.workOrderRepository.findByOrderIdWithWasher(doc._id);
    return OrderResponseDto.fromDocument(doc, wo ? washerEntry(wo) : undefined);
  }

  /** order_id (string) → assigned washer + work-order status, for the booking tab. */
  private async buildWasherMap(
    orderIds: Types.ObjectId[],
  ): Promise<
    Map<string, { washerId?: string; washerName?: string; status?: string }>
  > {
    const workOrders = await this.workOrderRepository.findByOrderIds(orderIds);
    const map = new Map<
      string,
      { washerId?: string; washerName?: string; status?: string }
    >();
    for (const wo of workOrders) {
      map.set(wo.order_id.toString(), washerEntry(wo));
    }
    return map;
  }

  // ---------- WASHER ----------

  /**
   * A washer's own schedule: bookings on the shifts they are rostered for.
   * `washerId` comes from the access token so one washer cannot read another's.
   */
  async getWasherSchedule(
    washerId: string,
    query: GetWasherScheduleQueryDto,
  ): Promise<WasherScheduleItemDto[]> {
    const { scheduledFrom, scheduledTo } = resolveScheduleRange(query);

    const shiftIds =
      await this.staffShiftRepository.findShiftIdsByStaff(washerId);
    if (shiftIds.length === 0) return [];

    const docs = await this.orderRepository.findWasherSchedule({
      staffShiftIds: shiftIds,
      status: query.status,
      scheduledFrom,
      scheduledTo,
    });
    return docs.map((d) => WasherScheduleItemDto.fromDocument(d));
  }

  async adminUpdateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Order not found');
    }
    const order = await this.orderRepository.findById(id);
    if (!order) throw new NotFoundException('Order not found');

    if (!isValidOrderTransition(order.status, dto.status)) {
      throw new BadRequestException(
        `Invalid status transition: ${order.status} → ${dto.status}`,
      );
    }
    if (order.status === dto.status) {
      return OrderResponseDto.fromDocument(order);
    }

    const cancelReason =
      dto.status === OrderStatusEnum.CANCELLED ||
      dto.status === OrderStatusEnum.NO_SHOW
        ? (dto.reason ?? `Set by staff to ${dto.status}`)
        : undefined;

    const updated = await this.orderRepository.updateById(id, {
      status: dto.status,
      cancelReason,
    });
    if (!updated) throw new NotFoundException('Order not found');

    if (dto.status === OrderStatusEnum.NO_SHOW) {
      await this.applyNoShowLoyaltyHookSafe(updated);
    }
    if (dto.status === OrderStatusEnum.CANCELLED) {
      await this.refundVoucherIfPresent(updated);
    }

    console.log(
      `Staff updated order status orderId=${id} from=${order.status} to=${dto.status}`,
    );
    return OrderResponseDto.fromDocument(updated);
  }

  /**
   * Called by WorkOrderService when QC passes. Owns the COMPLETED transition:
   * persist the status + run the loyalty hook (points + wash counter + voucher).
   */
  async markCompletedByWorkOrder(orderId: Types.ObjectId): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return;
    if (order.status === OrderStatusEnum.COMPLETED) return;
    const updated = await this.orderRepository.updateById(order._id, {
      status: OrderStatusEnum.COMPLETED,
    });
    if (!updated) return;

    try {
      const service = await this.serviceTypeRepository.findById(
        updated.service_type_id.toString(),
      );
      await this.loyaltyService.applyOrderCompleted(
        updated.customer_id,
        updated._id,
        updated.amount,
        service?.is_voucher_eligible ?? false,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Loyalty earn hook failed orderId=${updated._id.toString()} reason=${msg}`,
      );
    }
  }

  /** Cashier marks a CASH order as PAID after receiving money. */
  async adminMarkCashPaid(id: string): Promise<OrderResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Order not found');
    }
    const order = await this.orderRepository.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    if (order.payment_method !== PaymentMethodEnum.CASH) {
      throw new BadRequestException(
        'Only cash orders can be marked paid manually',
      );
    }
    if (order.payment_status === PaymentStatusEnum.PAID) {
      return OrderResponseDto.fromDocument(order);
    }
    const updated = await this.orderRepository.updateById(id, {
      paymentStatus: PaymentStatusEnum.PAID,
    });
    if (!updated) throw new NotFoundException('Order not found');
    console.log(`Cash order marked PAID orderId=${id}`);
    return OrderResponseDto.fromDocument(updated);
  }

  // ---------- CRON ENTRYPOINT ----------

  /**
   * Auto-marks cash orders as NO_SHOW when the customer never showed up past
   * the grace window. Only touches confirmed + cash + unpaid. Returns ids.
   */
  async expireUnconfirmedCash(cutoff: Date): Promise<string[]> {
    const docs = await this.orderRepository.findUnconfirmedCashPastDue(cutoff);
    const expired: string[] = [];
    for (const doc of docs) {
      const id = doc._id.toString();
      try {
        const updated = await this.orderRepository.updateById(id, {
          status: OrderStatusEnum.NO_SHOW,
          cancelReason: 'No arrival within grace window',
        });
        if (updated) {
          await this.applyNoShowLoyaltyHookSafe(updated);
        }
        expired.push(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`No-show sweep failed orderId=${id} reason=${msg}`);
      }
    }
    return expired;
  }

  /** Auto-cancels PENDING_PAYMENT orders created before `cutoff`. */
  async expirePendingPayment(cutoff: Date): Promise<string[]> {
    const docs = await this.orderRepository.findExpiredPending(cutoff);
    const expired: string[] = [];
    for (const doc of docs) {
      const id = doc._id.toString();
      try {
        const updated = await this.orderRepository.updateById(id, {
          status: OrderStatusEnum.CANCELLED,
          cancelReason: 'Payment timeout',
        });
        if (updated) await this.refundVoucherIfPresent(updated);
        if (doc.payos_order_code) {
          try {
            await this.payosService.cancelPaymentLink(
              doc.payos_order_code,
              'Timeout',
            );
          } catch {
            // Already expired on PayOS side.
          }
        }
        expired.push(id);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Expire failed orderId=${id} reason=${msg}`);
      }
    }
    return expired;
  }

  // ---------- helpers ----------

  private async requireOwned(
    id: string,
    customerId: string,
  ): Promise<OrderDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Order not found');
    }
    const doc = await this.orderRepository.findByIdForOwner(id, customerId);
    if (!doc) throw new NotFoundException('Order not found');
    return doc;
  }

  /** Best-effort hard delete of a vehicle registered inline during a failed booking. */
  private async rollbackInlineVehicle(
    vehicleId: Types.ObjectId,
  ): Promise<void> {
    try {
      await this.vehicleRepository.deleteById(vehicleId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Failed to roll back inline vehicle ${vehicleId.toString()}: ${msg}`,
      );
    }
  }

  /** Sends an order confirmation email. Errors are swallowed and logged. */
  private async sendConfirmationEmailSafe(order: OrderDocument): Promise<void> {
    try {
      const [user, service] = await Promise.all([
        this.userRepository.findById(order.customer_id),
        this.serviceTypeRepository.findById(order.service_type_id),
      ]);
      if (!user || !service) return;

      const includeCheckoutUrl =
        order.payment_method === PaymentMethodEnum.ONLINE &&
        order.payment_status !== PaymentStatusEnum.PAID;

      await this.emailService.sendOrderConfirmationEmail(user.email, {
        customerName: user.name,
        orderId: order._id.toString(),
        scheduledAt: order.scheduled_at,
        serviceName: service.name,
        amount: order.amount,
        paymentMethod: order.payment_method,
        paymentStatus: order.payment_status,
        checkoutUrl: includeCheckoutUrl ? order.payos_checkout_url : undefined,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Confirmation email failed orderId=${order._id.toString()} reason=${msg}`,
      );
    }
  }

  /**
   * Resolves the booking-time price. Golden hour is the gate: only a scheduledAt
   * inside an active window earns a discount (window discount stacked on tier
   * discount, clamped to the pricing-policy cap).
   */
  private async computeOrderPricing(
    scheduledAt: Date,
    tier: TierConfigDocument,
    originalAmount: number,
  ): Promise<{
    amount: number;
    discountAmount: number;
    discountPercent: number;
    discountReason?: string;
  }> {
    const window = await this.goldenHourService.findActiveAt(scheduledAt);
    if (!window) {
      return { amount: originalAmount, discountAmount: 0, discountPercent: 0 };
    }
    const capPercent =
      await this.pricingPolicyService.getMaxStackedDiscountPercent();
    const discountPercent = stackedDiscountPercent(
      window.discount_percent ?? 0,
      tier.discount_percent,
      capPercent,
    );
    if (discountPercent <= 0) {
      return { amount: originalAmount, discountAmount: 0, discountPercent: 0 };
    }
    const discountAmount = Math.round((originalAmount * discountPercent) / 100);
    const amount = Math.max(0, originalAmount - discountAmount);
    return {
      amount,
      discountAmount,
      discountPercent,
      discountReason: `golden_hour:${window.name}+tier:${tier.tier_name}`,
    };
  }

  /** Wraps LoyaltyService.applyOrderNoShow with a logged catch. */
  private async applyNoShowLoyaltyHookSafe(
    order: OrderDocument,
  ): Promise<void> {
    try {
      await this.loyaltyService.applyOrderNoShow(order.customer_id, order._id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Loyalty no-show hook failed orderId=${order._id.toString()} reason=${msg}`,
      );
    }
  }

  /** Returns a voucher consumed on `order` to UNUSED (every CANCELLED path; never NO_SHOW). */
  private async refundVoucherIfPresent(order: OrderDocument): Promise<void> {
    if (!order.voucher_id) return;
    try {
      await this.voucherService.refund(order.voucher_id);
      console.log(
        `Refunded voucher voucherId=${order.voucher_id.toString()} orderId=${order._id.toString()}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Voucher refund failed orderId=${order._id.toString()} voucherId=${order.voucher_id.toString()} reason=${msg}`,
      );
    }
  }

  /** Generates a unique PayOS orderCode using Redis INCR + a time-based base. */
  private async generateOrderCode(): Promise<number> {
    const seq = await redisClient.incr('seq:order:code');
    if (seq === 1) {
      await redisClient.expire('seq:order:code', 60 * 60 * 24 * 365);
    }
    const base = Math.floor(Date.now() / 1000) * 1000;
    return base + (seq % 1000);
  }
}

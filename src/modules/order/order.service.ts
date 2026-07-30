import { Types } from 'mongoose';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '../../common/exceptions';
import { config } from '../../config';
import { redisClient } from '../../core/redis';
import {
  RealtimeEvent,
  emitToCustomers,
  emitToOps,
  emitToUser,
} from '../../core/realtime';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { NotificationTypeEnum } from '../../shared/notification/types/notification-type.enum';
import { notificationService } from '../notification/notification.router';
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
import { GoldenHourConfigDocument } from '../golden-hour/golden-hour.model';
import { GoldenHourService } from '../golden-hour/golden-hour.service';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { PricingPolicyService } from '../pricing-policy/pricing-policy.service';
import { ServiceTypeDocument } from '../service-type/service-type.model';
import { ServiceTypeRepository } from '../service-type/service-type.repository';
import { StaffShiftDocument } from '../staff-shift/staff-shift.model';
import { StaffShiftRepository } from '../staff-shift/staff-shift.repository';
import { TierConfigDocument } from '../tier-config/tier-config.model';
import { TierConfigRepository } from '../tier-config/tier-config.repository';
import { VehicleDocument } from '../vehicle/vehicle.model';
import { VehicleRepository } from '../vehicle/vehicle.repository';
import { VehicleService } from '../vehicle/vehicle.service';
import { VoucherService } from '../voucher/voucher.service';
import { FeedbackRepository } from '../feedback/feedback.repository';
import { WorkOrderRepository } from '../work-order/work-order.repository';
import {
  DiscountCalculationService,
  IPricingResult,
  stackedDiscountPercent,
} from '../pricing/discount-calculation.service';
import { OrderDocument } from './order.model';
import { IOrderListFilter, OrderRepository } from './order.repository';
import { PaymentTransactionRepository } from './payment-transaction.repository';
import { PayosService } from './payos.service';

const TXN_DEDUP_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_SLOT_RANGE_MS = 31 * 24 * 60 * 60 * 1000; // slot query cap

/**
 * What a slot may advertise for a golden-hour window, decided by the pricing
 * engine's own rule so the badge cannot promise a discount the order refuses.
 *
 * A window sitting at 0% is NOT golden as far as the customer is concerned:
 * neither the promotion nor the tier pays there, so quoting the tier percent
 * would collapse to full price at the payment step.
 */
export function goldenHourSlotView(
  window: GoldenHourConfigDocument | null,
  tierDiscountPercent: number,
  capPercent: number,
): { isGoldenHour: boolean; discountPercent: number } {
  const windowDiscountPercent = window?.discount_percent ?? 0;
  return {
    isGoldenHour: windowDiscountPercent > 0,
    discountPercent: stackedDiscountPercent({
      windowDiscountPercent,
      tierDiscountPercent,
      maxStackedPercent: capPercent,
    }),
  };
}

/**
 * Projects the engine's breakdown onto the preview response.
 *
 * The legacy field names (`originalAmount`, `discountAmount`, `voucherError`)
 * are preserved so existing clients keep working; the VND-level breakdown and
 * the stable reason code are additive. `estimatedMinutes` is filled in by the
 * caller, which is the only figure the pricing engine has no opinion about.
 */
function toPreviewResponse(
  pricing: IPricingResult,
  tier: TierConfigDocument,
): Omit<PreviewOrderResponseDto, 'estimatedMinutes'> {
  return {
    originalAmount: pricing.subtotalVnd,
    discountAmount: pricing.totalDiscountVnd,
    discountPercent:
      pricing.subtotalVnd > 0
        ? Math.round((pricing.totalDiscountVnd / pricing.subtotalVnd) * 100)
        : 0,
    discountReason: pricing.discountReason,
    amount: pricing.finalTotalVnd,
    isGoldenHour: pricing.isGoldenHour,
    tierName: tier.tier_name,
    tierDiscountPercent: tier.discount_percent,
    voucherDiscountCapVnd: pricing.voucherDiscountCapVnd,
    voucherError: pricing.invalidReasonMessage,
    eligibleAmountVnd: pricing.eligibleAmountVnd,
    promotionDiscountVnd: pricing.promotionDiscountVnd,
    tierDiscountVnd: pricing.tierDiscountVnd,
    voucherDiscountVnd: pricing.voucherDiscountVnd,
    voucherAccepted: pricing.voucherAccepted,
    invalidReasonCode: pricing.invalidReasonCode,
    invalidReasonMessage: pricing.invalidReasonMessage,
  };
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

/** Ngày dương lịch giờ Việt Nam (UTC+7 cố định, không DST) của một thời điểm. */
export function vnDateOf(at: Date): string {
  return new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** `2026-07-30 14:30` in Vietnam local time, for user-facing messages. */
function vnDateTimeOf(at: Date): string {
  const shifted = new Date(at.getTime() + 7 * 3_600_000).toISOString();
  return `${shifted.slice(0, 10)} ${shifted.slice(11, 16)}`;
}

/**
 * Turns the `active_slot_key` index rejection into the same 409 the read-time
 * overlap check raises, so a customer who double-submits the booking form gets
 * a sentence instead of a 500. Any other error passes through untouched —
 * `payos_order_code` is unique too and its collision means something else.
 */
function asDoubleBookingConflict(err: unknown): unknown {
  const msg = err instanceof Error ? err.message : String(err);
  if (/E11000|duplicate key/i.test(msg) && /active_slot_key/.test(msg)) {
    return new ConflictException(
      'Xe này vừa được đặt vào đúng khung giờ đó. Vui lòng chọn giờ khác.',
    );
  }
  return err;
}

/**
 * Slot của ngày chứa `scheduledAt` vừa thay đổi (đơn tạo/hủy/dời/no-show) —
 * khách đang mở màn đặt lịch refetch slot của đúng ngày đó. Best-effort.
 */
export function emitSlotsChanged(scheduledAt: Date): void {
  emitToCustomers(RealtimeEvent.SLOTS_CHANGED, { date: vnDateOf(scheduledAt) });
}

/**
 * Trạng thái đơn vừa đổi (status hoặc payment_status): báo feed vận hành
 * (manager/admin/cashier) + chính chủ đơn trên mọi thiết bị. Payload là DTO
 * đầy đủ để client cập nhật không cần gọi REST bù. Best-effort — không bao
 * giờ làm fail flow chính (io null-safe).
 */
export function emitOrderStatus(order: OrderDocument): void {
  const dto = OrderResponseDto.fromDocument(order);
  emitToOps(RealtimeEvent.ORDER_STATUS, dto);
  // dto.customerId đã xử lý cả ref populated lẫn ObjectId thô.
  emitToUser(dto.customerId, RealtimeEvent.ORDER_STATUS, dto);
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
    private readonly discountCalculation: DiscountCalculationService,
  ) {}

  /**
   * Runs the shared pricing engine for one (service, vehicle, time, voucher)
   * tuple. Preview and order creation both come through here, so the number the
   * customer is shown is produced by the same code that prices the booking.
   */
  private async priceOrder(args: {
    customerId: string;
    tier: TierConfigDocument;
    service: ServiceTypeDocument;
    vehicleTypeId: string;
    scheduledAt: Date;
    subtotalVnd: number;
    voucherId?: string;
  }): Promise<IPricingResult> {
    const window = await this.goldenHourService.findActiveAt(args.scheduledAt);
    const maxStackedPercent =
      await this.pricingPolicyService.getMaxStackedDiscountPercent();

    return this.discountCalculation.calculate({
      customerId: args.customerId,
      tier: args.tier,
      serviceTypeId: args.service._id,
      vehicleTypeId: args.vehicleTypeId,
      serviceAcceptsVouchers: args.service.is_voucher_eligible,
      subtotalVnd: args.subtotalVnd,
      windowDiscountPercent: window?.discount_percent ?? 0,
      maxStackedPercent,
      voucherId: args.voucherId,
    });
  }

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

    // Only the saved-vehicle path can collide: the inline path registers a brand
    // new vehicle, and `license_plate` is globally unique, so a plate that is
    // already booked cannot reach here as a second vehicle document.
    if (savedVehicle) {
      await this.assertVehicleNotDoubleBooked({
        vehicleId: savedVehicle._id,
        startMs: dto.scheduledAt.getTime(),
        durationMinutes: cell.estimatedMinutes,
      });
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
      if (busy >= (candidate.capacity ?? 1)) continue;
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

    // Same engine as the preview, so the customer is charged what they were
    // quoted. A refused voucher is reported here rather than silently ignored.
    const pricing = await this.priceOrder({
      customerId,
      tier,
      service,
      vehicleTypeId,
      scheduledAt: dto.scheduledAt,
      subtotalVnd: cell.price,
      voucherId: dto.voucherId,
    });
    if (dto.voucherId && !pricing.voucherAccepted) {
      throw new BadRequestException(
        pricing.invalidReasonMessage ?? 'Voucher không dùng được cho đơn này',
      );
    }

    const originalAmount = pricing.subtotalVnd;
    const amount = pricing.finalTotalVnd;
    const discountAmount = pricing.totalDiscountVnd;
    const discountPercent =
      originalAmount > 0
        ? Math.round((discountAmount / originalAmount) * 100)
        : 0;
    const discountReason = pricing.discountReason;

    let voucherReserved = false;
    let voucherIdObj: Types.ObjectId | undefined;
    // Minted up front so the voucher can be reserved against the REAL order id.
    // The previous code passed a throwaway ObjectId here, which left every
    // redeemed voucher pointing at an order that does not exist.
    const orderId = new Types.ObjectId();

    let order: OrderDocument;
    try {
      if (dto.voucherId) {
        // Eligibility was checked above without a lock; this reservation is the
        // atomic compare-and-set that actually takes the voucher, so one seized
        // by a concurrent order fails here rather than being double-spent.
        //
        // The hold outlives the payment window by a minute so the sweep can
        // never race the gateway callback for the same order.
        const reserved = await this.voucherService.reserveForOrder({
          voucherId: dto.voucherId,
          customerId,
          orderId,
          reservedUntil: new Date(
            Date.now() + (config.booking.paymentTimeoutMinutes + 1) * 60_000,
          ),
          breakdown: pricing,
        });
        voucherReserved = true;
        voucherIdObj = reserved._id;
      }

      // Discounts covering the full price settle the order outright: there is
      // nothing for a gateway to charge and nothing for a cashier to collect,
      // whichever method the customer picked. It skips PENDING_PAYMENT entirely
      // rather than being bounced to the counter as it was before.
      const isFullyDiscounted = amount === 0;
      const isOnline =
        dto.paymentMethod === PaymentMethodEnum.ONLINE && !isFullyDiscounted;
      const initialStatus = isOnline
        ? OrderStatusEnum.PENDING_PAYMENT
        : OrderStatusEnum.CONFIRMED;
      const initialPaymentStatus = isFullyDiscounted
        ? PaymentStatusEnum.NO_PAYMENT_REQUIRED
        : PaymentStatusEnum.UNPAID;

      const payosOrderCode = isOnline
        ? await this.generateOrderCode()
        : undefined;
      order = await this.orderRepository.create({
        id: orderId,
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
      if (voucherReserved) {
        await this.voucherService.releaseForOrder(orderId);
      }
      throw asDoubleBookingConflict(err);
    }

    // An order that is CONFIRMED the moment it is created (cash bookings, and
    // orders the discounts settled outright) has nothing left to wait for, so
    // the hold is settled immediately. Online orders keep theirs until the
    // PayOS webhook says the money arrived.
    if (voucherReserved && order.status === OrderStatusEnum.CONFIRMED) {
      await this.voucherService.redeemForOrder(orderId);
    }

    // Derived from what was actually persisted rather than from the request:
    // a fully-discounted "online" order is already CONFIRMED and carries no
    // payos_order_code, so it correctly skips the gateway entirely.
    if (
      order.status === OrderStatusEnum.PENDING_PAYMENT &&
      order.payos_order_code
    ) {
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

    // Anything already CONFIRMED is a done deal (cash bookings, and orders the
    // discounts settled outright) — confirm it by email now. Orders still
    // waiting on PayOS get their email from the webhook instead.
    if (order.status === OrderStatusEnum.CONFIRMED) {
      await this.sendConfirmationEmailSafe(order);
    }

    console.log(
      `Order created customerId=${customerId} orderId=${order._id.toString()} ` +
        `method=${dto.paymentMethod} amount=${order.amount} payment=${order.payment_status}`,
    );
    const result = OrderResponseDto.fromDocument(order);
    emitToOps(RealtimeEvent.ORDER_CREATED, result);
    emitSlotsChanged(order.scheduled_at);
    void notificationService.notifyRoles([RoleEnum.MANAGER, RoleEnum.ADMIN], {
      type: NotificationTypeEnum.ORDER_CREATED,
      title: 'Đơn đặt lịch mới',
      body: `Có đơn rửa xe mới cần xử lý (${
        dto.paymentMethod === PaymentMethodEnum.CASH
          ? 'tiền mặt'
          : 'thanh toán online'
      }).`,
      data: { orderId: order._id.toString() },
    });
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
    const pricing = await this.priceOrder({
      customerId,
      tier,
      service,
      vehicleTypeId: dto.vehicleTypeId,
      scheduledAt: dto.scheduledAt,
      subtotalVnd: cell.price,
      voucherId: dto.voucherId,
    });

    return {
      ...toPreviewResponse(pricing, tier),
      estimatedMinutes: cell.estimatedMinutes,
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
        const free = Math.max(0, (shift.capacity ?? 1) - busy);
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
        const view = goldenHourSlotView(
          window,
          tier.discount_percent,
          capPercent,
        );
        const slot = new AvailableSlotDto();
        slot.scheduledAt = scheduledAt;
        slot.remainingCapacity = capacity;
        slot.isGoldenHour = view.isGoldenHour;
        slot.discountPercent = view.discountPercent;
        return slot;
      }),
    );
    return annotated;
  }

  /**
   * Rejects a booking whose wash window overlaps one the same car already has.
   *
   * Shift capacity is counted per washer, so nothing in that check stops one car
   * being booked twice into the same time — two free washers, or two different
   * services in one slot, and the same vehicle ends up owing two washes it can
   * only be present for once. This is the rule that says a car is in one place
   * at a time; it is deliberately independent of who owns it, since a licence
   * plate is unique across the whole system.
   *
   * Read-then-write, so two concurrent bookings can both pass here — the unique
   * index on `active_slot_key` is what closes that window for the identical-time
   * case, which is the one a double-submitted form produces.
   */
  private async assertVehicleNotDoubleBooked(args: {
    vehicleId: Types.ObjectId;
    startMs: number;
    durationMinutes: number;
    excludeOrderId?: Types.ObjectId | string;
  }): Promise<void> {
    const endMs = args.startMs + args.durationMinutes * 60_000;
    const existing = await this.orderRepository.findActiveByVehicle(
      args.vehicleId,
      args.excludeOrderId,
    );
    for (const o of existing) {
      const otherStartMs = o.scheduled_at.getTime();
      const otherDurMs =
        o.estimated_minutes > 0
          ? o.estimated_minutes * 60_000
          : endMs - args.startMs;
      if (otherStartMs < endMs && args.startMs < otherStartMs + otherDurMs) {
        throw new ConflictException(
          `Xe này đã có lịch rửa lúc ${vnDateTimeOf(o.scheduled_at)} ` +
            'trùng với khung giờ bạn chọn. Vui lòng chọn giờ khác hoặc huỷ lịch cũ.',
        );
      }
    }
  }

  /**
   * For each given shift, count its active orders whose wash window overlaps
   * [fromMs, toMs). Enforces per-time-slot concurrency (one wash per washer).
   */
  private async countConcurrentByShift(
    shiftIds: Types.ObjectId[],
    fromMs: number,
    toMs: number,
    excludeOrderId?: Types.ObjectId,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (shiftIds.length === 0) return result;
    const defaultDurationMs = toMs - fromMs;
    const orders = await this.orderRepository.findActiveByShifts(shiftIds);
    for (const o of orders) {
      if (excludeOrderId && o._id.equals(excludeOrderId)) continue;
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

    // Shifts are anonymous, so the customer moves to a *time* and the server
    // finds the shift — mirroring createOrder. An explicit staffShiftId is
    // still honoured for callers that already know the shift they want.
    let candidates: StaffShiftDocument[];
    if (dto.staffShiftId) {
      const newShift = await this.staffShiftRepository.findById(
        dto.staffShiftId,
      );
      if (
        !newShift ||
        (newShift.status !== ShiftStatusEnum.SCHEDULED &&
          newShift.status !== ShiftStatusEnum.ACTIVE) ||
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
      if (finishMs > newShift.end_at.getTime()) {
        throw new BadRequestException(
          `Service requires ${durationMin} min and would overrun the new shift end`,
        );
      }
      candidates = [newShift];
    } else {
      candidates = await this.staffShiftRepository.findShiftsContaining(
        dto.scheduledAt,
        durationMin,
      );
      if (candidates.length === 0) {
        throw new ConflictException(
          'No shift covers this time, or all shifts are full',
        );
      }
    }

    // Excluding this order is what makes a move *within* its own shift work:
    // its current booking overlaps the target window and would otherwise count
    // as the conflict that blocks it.
    const concurrency = await this.countConcurrentByShift(
      candidates.map((c) => c._id),
      dto.scheduledAt.getTime(),
      finishMs,
      order._id,
    );
    const target = candidates.find(
      (c) => (concurrency.get(c._id.toString()) ?? 0) < (c.capacity ?? 1),
    );
    if (!target) {
      throw new ConflictException('All shifts at this time are full');
    }

    // The car must not land on top of another of its own bookings. This order is
    // excluded so moving it within its current window is not a self-conflict.
    await this.assertVehicleNotDoubleBooked({
      vehicleId: order.vehicle_id,
      startMs: dto.scheduledAt.getTime(),
      durationMinutes: durationMin,
      excludeOrderId: order._id,
    });

    let updated: OrderDocument | null;
    try {
      updated = await this.orderRepository.applyReschedule(
        id,
        target._id,
        dto.scheduledAt,
        order.vehicle_id,
      );
    } catch (err) {
      throw asDoubleBookingConflict(err);
    }
    if (!updated) throw new NotFoundException('Order not found');
    console.log(
      `Order rescheduled orderId=${id} newShiftId=${target._id.toString()}`,
    );
    emitOrderStatus(updated);
    emitSlotsChanged(order.scheduled_at); // ngày cũ: slot được nhả
    emitSlotsChanged(updated.scheduled_at); // ngày mới: slot bị chiếm
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
    emitOrderStatus(updated);
    emitSlotsChanged(updated.scheduled_at);
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
            // Money is in — only now is the voucher actually spent. The hold
            // has protected it for the whole time the customer spent at the
            // gateway, which is what the old burn-at-booking flow could not do.
            await this.redeemVoucherIfPresent(updated);
            await this.sendConfirmationEmailSafe(updated);
            emitOrderStatus(updated);
          }
        } else {
          const cancelled = await this.orderRepository.updateById(order._id, {
            status: OrderStatusEnum.CANCELLED,
            cancelReason: 'Payment failed',
          });
          if (cancelled) {
            await this.refundVoucherIfPresent(cancelled);
            emitOrderStatus(cancelled);
            emitSlotsChanged(cancelled.scheduled_at);
          }
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
   * A washer's day view: every booking in the requested window. Shifts are
   * anonymous (no roster), so the schedule is the shared queue — who actually
   * washes each car is decided by work-order auto-assign, not the shift.
   */
  async getWasherSchedule(
    query: GetWasherScheduleQueryDto,
  ): Promise<WasherScheduleItemDto[]> {
    const { scheduledFrom, scheduledTo } = resolveScheduleRange(query);

    const docs = await this.orderRepository.findWasherSchedule({
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
    emitOrderStatus(updated);
    if (
      dto.status === OrderStatusEnum.CANCELLED ||
      dto.status === OrderStatusEnum.NO_SHOW
    ) {
      emitSlotsChanged(updated.scheduled_at);
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
    emitOrderStatus(updated);

    try {
      const service = await this.serviceTypeRepository.findById(
        updated.service_type_id.toString(),
      );
      await this.loyaltyService.applyOrderCompleted(
        updated.customer_id,
        updated._id,
        updated.amount,
        service?.is_voucher_eligible ?? false,
        updated.discount_amount,
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
    if (order.payment_status === PaymentStatusEnum.NO_PAYMENT_REQUIRED) {
      throw new BadRequestException(
        'Đơn này đã được giảm hết, không có tiền để thu.',
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
    emitOrderStatus(updated);
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
          emitOrderStatus(updated);
          emitSlotsChanged(updated.scheduled_at);
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
        if (updated) {
          await this.refundVoucherIfPresent(updated);
          emitOrderStatus(updated);
          emitSlotsChanged(updated.scheduled_at);
        }
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
      // Handles both a hold that never settled and one that did: the redemption
      // record knows which, and backs the campaign budget out when needed.
      await this.voucherService.releaseForOrder(order._id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Voucher release failed orderId=${order._id.toString()} voucherId=${order.voucher_id.toString()} reason=${msg}`,
      );
    }
  }

  /**
   * Settles the voucher hold once money has actually arrived. Best-effort and
   * logged: a failure here must not make the webhook look unprocessed, or PayOS
   * would retry a payment we have already recorded.
   */
  private async redeemVoucherIfPresent(order: OrderDocument): Promise<void> {
    if (!order.voucher_id) return;
    try {
      await this.voucherService.redeemForOrder(order._id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `Voucher redeem failed orderId=${order._id.toString()} voucherId=${order.voucher_id.toString()} reason=${msg}`,
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

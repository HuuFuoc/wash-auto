import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Redis from 'ioredis';
import { Types } from 'mongoose';
import { REDIS_CLIENT } from '../../../core/cache/cache.module';
import { UserRepository } from '../../auth/repositories/user.repository';
import { EmailService } from '../../email/email.service';
import { GoldenHourService } from '../../golden-hour/golden-hour.service';
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { ServiceTypeRepository } from '../../service-type/repositories/service-type.repository';
import { StaffShiftRepository } from '../../staff-shift/repositories/staff-shift.repository';
import { ShiftStatusEnum } from '../../staff-shift/types/shift-status.enum';
import { TierConfigDocument } from '../../tier-config/entities/tier-config.entity';
import { TierConfigRepository } from '../../tier-config/repositories/tier-config.repository';
import { VehicleRepository } from '../../vehicle/repositories/vehicle.repository';
import { VehicleService } from '../../vehicle/vehicle.service';
import { VoucherService } from '../../voucher/voucher.service';
import { AvailableSlotDto } from '../dto/available-slot.dto';
import { CancelOrderDto } from '../dto/cancel-order.dto';
import { CreateOrderDto } from '../dto/create-order.dto';
import {
  OrderListResponseDto,
  OrderResponseDto,
} from '../dto/order-response.dto';
import {
  PreviewOrderDto,
  PreviewOrderResponseDto,
} from '../dto/preview-order.dto';
import { QueryAvailableSlotsDto } from '../dto/query-available-slots.dto';
import { QueryOrderDto } from '../dto/query-order.dto';
import { RescheduleOrderDto } from '../dto/reschedule-order.dto';
import { UpdateOrderStatusDto } from '../dto/update-order-status.dto';
import { OrderDocument } from '../entities/order.entity';
import {
  consumesShiftCapacity,
  isCancellableByOwner,
  isValidOrderTransition,
} from '../order.state-machine';
import {
  IOrderListFilter,
  OrderRepository,
} from '../repositories/order.repository';
import { PaymentTransactionRepository } from '../repositories/payment-transaction.repository';
import { OrderStatusEnum } from '../types/order-status.enum';
import { PaymentMethodEnum } from '../types/payment-method.enum';
import { PaymentStatusEnum } from '../types/payment-status.enum';
import { PayosService } from './payos.service';

const TXN_DEDUP_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days
const MAX_SLOT_RANGE_MS = 31 * 24 * 60 * 60 * 1000; // slot query cap

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

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
    private readonly config: ConfigService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  // ---------- CUSTOMER ----------

  async createOrder(
    customerId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    // 1) Vehicle source — exactly one of: a saved vehicle id, or inline
    //    details for a new vehicle. The vehicle itself is resolved later
    //    (step 7) so a failed booking never leaves a half-created vehicle.
    const hasSavedVehicle = !!dto.vehicleId;
    const hasInlineVehicle = !!dto.vehicle;
    if (hasSavedVehicle === hasInlineVehicle) {
      throw new BadRequestException(
        'Provide exactly one of `vehicleId` (saved vehicle) or ' +
          '`vehicle` (new vehicle details)',
      );
    }

    // 2) Service type
    const service = await this.serviceTypeRepository.findById(
      dto.serviceTypeId,
    );
    if (!service || !service.is_active) {
      throw new BadRequestException('Service type not found or inactive');
    }

    // 3) Time must be in the future. The server picks the shift later —
    //    no user-supplied staffShiftId.
    if (dto.scheduledAt.getTime() < Date.now() - 60_000) {
      throw new BadRequestException('scheduledAt must be in the future');
    }

    // 4) Tier window
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

    // 5) Active cap
    const maxActive = this.config.getOrThrow<number>(
      'booking.maxActivePerCustomer',
    );
    const active = await this.orderRepository.countActiveByCustomer(customerId);
    if (active >= maxActive) {
      throw new BadRequestException(
        `You already have ${active} active orders (limit ${maxActive})`,
      );
    }

    // 6) Auto-pick a shift that contains scheduledAt and has capacity.
    //    Loop because findShiftsContaining is a non-transactional read —
    //    a concurrent booking may have filled the candidate between the
    //    read and the atomic increment.
    const candidates = await this.staffShiftRepository.findShiftsContaining(
      dto.scheduledAt,
      service.estimated_minutes,
    );
    if (candidates.length === 0) {
      throw new ConflictException(
        'No shift covers this time, or all shifts are full',
      );
    }
    // Per-time-slot concurrency: a candidate shift is only usable if the
    // number of its active orders whose wash window overlaps this booking's
    // window [scheduledAt, finishAt) is below max_bookings. This mirrors the
    // overlap rule in listAvailableSlots so a slot the FE offered is the slot
    // the POST accepts (barring a concurrent fill).
    const wantStartMs = dto.scheduledAt.getTime();
    const wantEndMs = wantStartMs + service.estimated_minutes * 60_000;
    const concurrencyByShift = await this.countConcurrentByShift(
      candidates.map((c) => c._id),
      wantStartMs,
      wantEndMs,
    );
    let reservedShiftId: Types.ObjectId | undefined;
    for (const candidate of candidates) {
      const busy = concurrencyByShift.get(candidate._id.toString()) ?? 0;
      if (busy >= candidate.max_bookings) continue;
      const ok = await this.staffShiftRepository.incrementCurrentBookings(
        candidate._id,
      );
      if (ok) {
        reservedShiftId = candidate._id;
        break;
      }
    }
    if (!reservedShiftId) {
      throw new ConflictException('All shifts at this time are full');
    }

    // 7) Resolve the vehicle now that the slot is held. Doing it here means
    //    the common "no shift" rejection above never registers a stray
    //    vehicle. `createdVehicleId` is set only when we saved a new vehicle
    //    inline — it is rolled back if the order then fails to persist.
    let vehicleObjId: Types.ObjectId;
    let createdVehicleId: Types.ObjectId | undefined;
    try {
      if (dto.vehicleId) {
        const vehicle = await this.vehicleRepository.findByIdForOwner(
          dto.vehicleId,
          customerId,
        );
        if (!vehicle || !vehicle.is_active) {
          throw new NotFoundException('Vehicle not found');
        }
        vehicleObjId = vehicle._id;
      } else {
        const created = await this.vehicleService.createOwn(
          customerId,
          dto.vehicle!,
        );
        vehicleObjId = new Types.ObjectId(created.id);
        createdVehicleId = vehicleObjId;
      }
    } catch (err) {
      await this.staffShiftRepository.decrementCurrentBookings(reservedShiftId);
      throw err;
    }

    // 8) Compute amount: start from service base price, then apply
    //    golden-hour tier discount (if scheduledAt falls inside an active
    //    window AND tier has a discount), then optionally stack a FREE_WASH
    //    voucher capped at `voucher.discount_cap_vnd`. The voucher used to
    //    zero the order out (100% off); it now stacks with golden hour and
    //    is capped so a voucher minted off Basic washes cannot be redeemed
    //    against a Detailing service for more than its configured ceiling.
    const originalAmount = Math.round(
      parseFloat(service.base_price.toString()),
    );
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

    // 9) Create order; on failure release the shift slot and roll back a
    //    vehicle created inline so a failed POST leaves nothing behind.
    let order: OrderDocument;
    try {
      // Voucher consume happens *before* persisting so a failure here aborts
      // cleanly. If order persist later fails we refund the voucher in the
      // catch block.
      if (dto.voucherId) {
        // Economic guardrail: a service flagged `is_voucher_eligible=false`
        // (typically Detailing) rejects voucher redemption up front so the
        // voucher is NOT consumed on a service that would push margin
        // below the safety threshold. See docs/ECONOMIC_GUARDRAILS.md §4.
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

        // Voucher discount is capped at min(voucherCap, remaining amount).
        // `remaining` is the post-tier-discount amount so the voucher only
        // shaves off what is still chargeable.
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

        // PayOS will not accept a 0-VND payment link. If discounts wipe the
        // total clean, fall back to cash so a cashier closes the order at
        // the counter.
        if (isOnline && amount === 0) {
          throw new BadRequestException(
            'Order total is 0 VND after discounts — please pay in cash at the counter',
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
      await this.staffShiftRepository.decrementCurrentBookings(reservedShiftId);
      if (createdVehicleId) {
        await this.rollbackInlineVehicle(createdVehicleId);
      }
      if (voucherDoc) {
        await this.voucherService.refund(voucherDoc._id);
      }
      throw err;
    }

    // 10) If online → create PayOS link (rollback on failure)
    if (isOnline && order.payos_order_code) {
      const returnUrl = this.config.getOrThrow<string>('payos.returnUrl');
      const cancelUrl = this.config.getOrThrow<string>('payos.cancelUrl');
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
        await this.staffShiftRepository.decrementCurrentBookings(
          reservedShiftId,
        );
        await this.orderRepository.updateById(order._id, {
          status: OrderStatusEnum.CANCELLED,
          cancelReason: 'PayOS link creation failed',
        });
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`PayOS createPaymentLink failed: ${msg}`);
        throw new BadRequestException(
          'Failed to create payment link. Please try again.',
        );
      }
    }

    // 11) Confirmation email:
    //   - CASH → send now, the order is already CONFIRMED.
    //   - ONLINE → defer until the PayOS webhook flips us to CONFIRMED+PAID,
    //     so the customer never gets a "confirmation" for an unpaid booking.
    // Awaited (not fire-and-forget) so serverless platforms like Vercel
    // don't freeze the function before SMTP finishes sending.
    if (dto.paymentMethod === PaymentMethodEnum.CASH) {
      await this.sendConfirmationEmailSafe(order);
    }

    this.logger.log(
      `Order created customerId=${customerId} orderId=${order._id.toString()} method=${dto.paymentMethod}`,
    );
    return OrderResponseDto.fromDocument(order);
  }

  async listOwn(customerId: string): Promise<OrderResponseDto[]> {
    const docs = await this.orderRepository.findByOwner(customerId);
    return docs.map((d) => OrderResponseDto.fromDocument(d));
  }

  async getOwn(customerId: string, id: string): Promise<OrderResponseDto> {
    const doc = await this.requireOwned(id, customerId);
    return OrderResponseDto.fromDocument(doc);
  }

  /**
   * Returns the pricing breakdown a customer would see if they posted the
   * exact same (service, time, voucher) tuple to `POST /me/orders` right now.
   * No side effects — the voucher is NOT consumed, no shift slot is held.
   *
   * The math intentionally mirrors `createOrder` so the figures the FE shows
   * and the figures persisted on the order match to the dong. If the voucher
   * is missing, expired, or already used we return a `voucherError` and treat
   * the request as if no voucher was supplied — the customer still sees the
   * tier-discount price and can decide whether to proceed.
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

    const originalAmount = Math.round(
      parseFloat(service.base_price.toString()),
    );
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
        // Same guardrail as createOrder — surface the reason here so the
        // FE can disable the "Áp voucher" button instead of letting the
        // customer click then get a 400. See docs/ECONOMIC_GUARDRAILS.md §4.
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
   * service inside [from, to]. A slot is bookable when some SCHEDULED shift
   * fully contains [slot, slot + service duration] and still has capacity —
   * exactly the rule `createOrder` applies — so every slot returned here is
   * one `POST /me/orders` will accept (barring a concurrent fill).
   *
   * Slots sit on a fixed global grid (`booking.slotIntervalMinutes`), so a
   * slot covered by two overlapping shifts is reported once with the
   * combined free capacity.
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
    const durationMs = service.estimated_minutes * 60_000;

    // Clip the window: no slot earlier than now, none past the customer's
    // tier booking horizon — mirrors the checks in createOrder so the FE
    // never shows a slot the POST would reject.
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

    const intervalMs =
      this.config.getOrThrow<number>('booking.slotIntervalMinutes') * 60_000;

    // Per-time-slot capacity: a slot's free capacity is the shift's
    // `max_bookings` minus the orders whose wash window actually OVERLAPS that
    // slot — not the shift-wide `current_bookings` (which made every slot in a
    // shift drop together when one was booked). Booking 09:00 only ties up the
    // washer for [09:00, 09:00 + serviceDuration], so 09:30 stays free.
    const serviceDurationMsById = new Map<string, number>();
    for (const svc of await this.serviceTypeRepository.findAll()) {
      serviceDurationMsById.set(
        svc._id.toString(),
        svc.estimated_minutes * 60_000,
      );
    }
    // Existing active orders on these shifts → busy windows per shift.
    const busyWindowsByShift = new Map<string, [number, number][]>();
    const activeOrders = await this.orderRepository.findActiveByShifts(
      shifts.map((s) => s._id),
    );
    for (const o of activeOrders) {
      const shiftId = o.staff_shift_id.toString();
      const startMs = o.scheduled_at.getTime();
      const orderDurationMs =
        serviceDurationMsById.get(o.service_type_id.toString()) ?? durationMs;
      const list = busyWindowsByShift.get(shiftId) ?? [];
      list.push([startMs, startMs + orderDurationMs]);
      busyWindowsByShift.set(shiftId, list);
    }

    // slot start (ms) → summed free capacity of every shift covering it.
    const capacityBySlot = new Map<number, number>();
    for (const shift of shifts) {
      if (shift.max_bookings <= 0) continue;
      const busyWindows = busyWindowsByShift.get(shift._id.toString()) ?? [];
      const shiftEndMs = shift.end_at.getTime();
      // First grid point at or after the shift start.
      let slotMs =
        Math.ceil(shift.start_at.getTime() / intervalMs) * intervalMs;
      for (; slotMs + durationMs <= shiftEndMs; slotMs += intervalMs) {
        if (slotMs < windowStartMs || slotMs > windowEndMs) continue;
        const slotEndMs = slotMs + durationMs;
        // Concurrent orders on this shift overlapping [slotMs, slotEndMs).
        let busy = 0;
        for (const [bStart, bEnd] of busyWindows) {
          if (bStart < slotEndMs && slotMs < bEnd) busy++;
        }
        const free = shift.max_bookings - busy;
        if (free <= 0) continue;
        capacityBySlot.set(slotMs, (capacityBySlot.get(slotMs) ?? 0) + free);
      }
    }

    // Annotate every slot with the golden-hour flag and the tier discount
    // percent the caller would earn if they booked it. `isGoldenHour` is the
    // literal "scheduled_at falls inside an active window" — true even for
    // None-tier customers (FE can use it to suggest upgrading) — while
    // `discountPercent` is what the caller would actually save. Looking up
    // the golden-hour window directly (instead of computeOrderPricing) avoids
    // the early-return in computeOrderPricing that masks None-tier slots.
    const sortedEntries = [...capacityBySlot.entries()].sort(
      ([a], [b]) => a - b,
    );
    const annotated = await Promise.all(
      sortedEntries.map(async ([ms, capacity]) => {
        const scheduledAt = new Date(ms);
        const window = await this.goldenHourService.findActiveAt(scheduledAt);
        const slot = new AvailableSlotDto();
        slot.scheduledAt = scheduledAt;
        slot.remainingCapacity = capacity;
        slot.isGoldenHour = !!window;
        slot.discountPercent = window ? tier.discount_percent : 0;
        return slot;
      }),
    );
    return annotated;
  }

  /**
   * For each given shift, count its active orders whose wash window overlaps
   * [fromMs, toMs). Used by createOrder/rescheduleOwn to enforce per-time-slot
   * concurrency (up to max_bookings concurrent washes per slot) instead of the
   * shift-wide counter.
   */
  private async countConcurrentByShift(
    shiftIds: Types.ObjectId[],
    fromMs: number,
    toMs: number,
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (shiftIds.length === 0) return result;
    const serviceDurationMsById = new Map<string, number>();
    for (const svc of await this.serviceTypeRepository.findAll()) {
      serviceDurationMsById.set(
        svc._id.toString(),
        svc.estimated_minutes * 60_000,
      );
    }
    const defaultDurationMs = toMs - fromMs;
    const orders = await this.orderRepository.findActiveByShifts(shiftIds);
    for (const o of orders) {
      const startMs = o.scheduled_at.getTime();
      const durMs =
        serviceDurationMsById.get(o.service_type_id.toString()) ??
        defaultDurationMs;
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
    const maxReschedules = this.config.getOrThrow<number>(
      'booking.maxReschedules',
    );
    if (order.reschedule_count >= maxReschedules) {
      throw new BadRequestException(
        `Reschedule limit reached (${maxReschedules})`,
      );
    }

    const newShift = await this.staffShiftRepository.findById(dto.staffShiftId);
    if (!newShift || newShift.status !== ShiftStatusEnum.SCHEDULED) {
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
    const service = await this.serviceTypeRepository.findById(
      order.service_type_id,
    );
    if (!service) {
      throw new BadRequestException('Original service type missing');
    }
    const finishMs =
      dto.scheduledAt.getTime() + service.estimated_minutes * 60_000;
    if (finishMs > newShift.end_at.getTime()) {
      throw new BadRequestException(
        `Service requires ${service.estimated_minutes} min and would overrun the new shift end`,
      );
    }

    // Per-time-slot concurrency on the target shift (same overlap rule as
    // createOrder / listAvailableSlots) before holding the shift-wide slot.
    const concurrency = await this.countConcurrentByShift(
      [new Types.ObjectId(dto.staffShiftId)],
      dto.scheduledAt.getTime(),
      finishMs,
    );
    if ((concurrency.get(dto.staffShiftId) ?? 0) >= newShift.max_bookings) {
      throw new ConflictException('New shift is full at this time');
    }

    const reserved = await this.staffShiftRepository.incrementCurrentBookings(
      dto.staffShiftId,
    );
    if (!reserved) {
      throw new ConflictException('New shift is full');
    }

    try {
      const updated = await this.orderRepository.applyReschedule(
        id,
        new Types.ObjectId(dto.staffShiftId),
        dto.scheduledAt,
      );
      if (!updated) throw new NotFoundException('Order not found');
      await this.staffShiftRepository.decrementCurrentBookings(
        order.staff_shift_id,
      );
      this.logger.log(
        `Order rescheduled orderId=${id} newShiftId=${dto.staffShiftId}`,
      );
      return OrderResponseDto.fromDocument(updated);
    } catch (err) {
      await this.staffShiftRepository.decrementCurrentBookings(
        dto.staffShiftId,
      );
      throw err;
    }
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

    // If online + still PENDING_PAYMENT, also cancel PayOS link best-effort.
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

    if (consumesShiftCapacity(order.status)) {
      await this.staffShiftRepository.decrementCurrentBookings(
        order.staff_shift_id,
      );
    }
    const updated = await this.orderRepository.updateById(id, {
      status: OrderStatusEnum.CANCELLED,
      cancelReason: dto.reason ?? 'Cancelled by customer',
    });
    if (!updated) throw new NotFoundException('Order not found');
    // The customer never received service — return the voucher (if any)
    // to UNUSED so it can be redeemed on a future booking.
    await this.refundVoucherIfPresent(updated);
    return OrderResponseDto.fromDocument(updated);
  }

  // ---------- WEBHOOK ----------

  /**
   * PayOS webhook handler. Idempotency layers:
   *   1. Signature verification.
   *   2. Redis SETNX on transaction reference (30d window).
   *   3. Redis per-order lock (10s).
   *   4. Unique sparse index on payos_transaction_id (DB safety net).
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
      this.logger.warn('Invalid PayOS webhook signature received');
      return;
    }

    const { orderCode, amount, transactionDateTime, reference, code, desc } =
      webhookData;

    if (reference) {
      const dedupKey = `payos:txn:${reference}`;
      const claimed = await this.redis.set(
        dedupKey,
        '1',
        'EX',
        TXN_DEDUP_TTL_SECONDS,
        'NX',
      );
      if (claimed === null) {
        this.logger.log(
          `Webhook replay ignored reference=${reference} orderCode=${String(orderCode)}`,
        );
        return;
      }
    }

    const lockKey = `lock:order:${orderCode}`;
    const lockAcquired = await this.redis.set(lockKey, '1', 'EX', 10, 'NX');
    if (lockAcquired === null) {
      this.logger.warn(
        `Webhook lock contention orderCode=${String(orderCode)} — PayOS will retry`,
      );
      return;
    }

    try {
      const order = await this.orderRepository.findByPayosOrderCode(
        Number(orderCode),
      );
      if (!order) {
        this.logger.warn(
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
          // Payment settled — now safe to send the confirmation email.
          // Awaited so the serverless function doesn't freeze before SMTP completes.
          if (updated) {
            await this.sendConfirmationEmailSafe(updated);
          }
        } else {
          if (consumesShiftCapacity(order.status)) {
            await this.staffShiftRepository.decrementCurrentBookings(
              order.staff_shift_id,
            );
          }
          const cancelled = await this.orderRepository.updateById(order._id, {
            status: OrderStatusEnum.CANCELLED,
            cancelReason: 'Payment failed',
          });
          // Payment failed → service was never rendered, return the voucher.
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
          this.logger.log(
            `Webhook duplicate transaction insert ignored reference=${reference ?? ''}`,
          );
        } else {
          throw err;
        }
      }

      this.logger.log(
        `Webhook processed orderCode=${String(orderCode)} paid=${isPaid} orderId=${order._id.toString()}`,
      );
    } finally {
      await this.redis.del(lockKey);
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
    return {
      data: docs.map((d) => OrderResponseDto.fromDocument(d)),
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
    return OrderResponseDto.fromDocument(doc);
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

    if (
      consumesShiftCapacity(order.status) &&
      !consumesShiftCapacity(dto.status)
    ) {
      await this.staffShiftRepository.decrementCurrentBookings(
        order.staff_shift_id,
      );
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

    // Loyalty hook: a NO_SHOW transition penalises the customer's point
    // balance and may demote their tier. Failures are logged but never
    // bubble up — the order status update has already happened and an audit
    // gap is preferable to surfacing a 500 here.
    if (dto.status === OrderStatusEnum.NO_SHOW) {
      await this.applyNoShowLoyaltyHookSafe(updated);
    }
    // CANCELLED → no service rendered → return the voucher (if any).
    // NO_SHOW intentionally burns the voucher as part of the penalty
    // alongside the -50 loyalty points.
    if (dto.status === OrderStatusEnum.CANCELLED) {
      await this.refundVoucherIfPresent(updated);
    }

    this.logger.log(
      `Staff updated order status orderId=${id} from=${order.status} to=${dto.status}`,
    );
    return OrderResponseDto.fromDocument(updated);
  }

  /**
   * Called by WorkOrderService when QC passes. Owns the COMPLETED transition
   * end-to-end: persist the status, release the shift slot, and run the
   * loyalty hook (points + wash counter + voucher mint). Centralising it
   * here keeps every terminal-status side effect in one place so admin and
   * work-order paths can never diverge.
   */
  async markCompletedByWorkOrder(orderId: Types.ObjectId): Promise<void> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) return;
    if (order.status === OrderStatusEnum.COMPLETED) return;
    if (consumesShiftCapacity(order.status)) {
      await this.staffShiftRepository.decrementCurrentBookings(
        order.staff_shift_id,
      );
    }
    const updated = await this.orderRepository.updateById(order._id, {
      status: OrderStatusEnum.COMPLETED,
    });
    if (!updated) return;

    try {
      // Only washes on a voucher-eligible service advance the loyalty voucher
      // cycle (e.g. Detailing is excluded), so the reward economics stay scoped
      // to the wash packages the program is designed around.
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
      this.logger.error(
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
    this.logger.log(`Cash order marked PAID orderId=${id}`);
    return OrderResponseDto.fromDocument(updated);
  }

  // ---------- CRON ENTRYPOINT ----------

  /**
   * Auto-marks cash orders as NO_SHOW when the customer never showed up
   * past the configured grace window after `scheduled_at`. Releases shift
   * slot. Only touches `confirmed` + `cash` + `unpaid` — paid cash means
   * the customer arrived and the cashier already collected. Returns the
   * affected order ids.
   */
  async expireUnconfirmedCash(cutoff: Date): Promise<string[]> {
    const docs = await this.orderRepository.findUnconfirmedCashPastDue(cutoff);
    const expired: string[] = [];
    for (const doc of docs) {
      const id = doc._id.toString();
      try {
        if (consumesShiftCapacity(doc.status)) {
          await this.staffShiftRepository.decrementCurrentBookings(
            doc.staff_shift_id,
          );
        }
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
        this.logger.error(`No-show sweep failed orderId=${id} reason=${msg}`);
      }
    }
    return expired;
  }

  /**
   * Auto-cancels PENDING_PAYMENT orders created before `cutoff`. Releases
   * their shift slots. Returns expired order ids.
   */
  async expirePendingPayment(cutoff: Date): Promise<string[]> {
    const docs = await this.orderRepository.findExpiredPending(cutoff);
    const expired: string[] = [];
    for (const doc of docs) {
      const id = doc._id.toString();
      try {
        if (consumesShiftCapacity(doc.status)) {
          await this.staffShiftRepository.decrementCurrentBookings(
            doc.staff_shift_id,
          );
        }
        const updated = await this.orderRepository.updateById(id, {
          status: OrderStatusEnum.CANCELLED,
          cancelReason: 'Payment timeout',
        });
        // Customer never paid → refund the voucher (if any) so they can
        // try again on a later booking instead of losing it to a network
        // hiccup on the payment page.
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
        this.logger.error(`Expire failed orderId=${id} reason=${msg}`);
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

  /**
   * Best-effort hard delete of a vehicle registered inline during a booking
   * that then failed. Swallows its own errors — the booking failure is what
   * the caller must surface; a leftover vehicle would only block the
   * customer from retrying with the same plate.
   */
  private async rollbackInlineVehicle(
    vehicleId: Types.ObjectId,
  ): Promise<void> {
    try {
      await this.vehicleRepository.deleteById(vehicleId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Failed to roll back inline vehicle ${vehicleId.toString()}: ${msg}`,
      );
    }
  }

  /**
   * Sends an order confirmation email. Errors are swallowed and logged —
   * the order is already persisted, so failing the API on a SMTP hiccup
   * is worse than a missed email that staff can resend.
   *
   * Looks up the service name internally so callers only need the order.
   * For online orders the checkoutUrl is omitted from the email body
   * because by the time this is called (post-webhook) payment is settled
   * and the link is no longer actionable.
   */
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
      this.logger.error(
        `Confirmation email failed orderId=${order._id.toString()} reason=${msg}`,
      );
    }
  }

  /**
   * Resolves the booking-time price: applies the customer's tier discount
   * percent when scheduledAt lands inside an active golden-hour window.
   * Outside golden hours OR when the tier carries no discount, the original
   * price is returned untouched. The voucher path overrides this entirely
   * (handled by the caller).
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
    if (tier.discount_percent <= 0) {
      return { amount: originalAmount, discountAmount: 0, discountPercent: 0 };
    }
    const window = await this.goldenHourService.findActiveAt(scheduledAt);
    if (!window) {
      return { amount: originalAmount, discountAmount: 0, discountPercent: 0 };
    }
    const discountAmount = Math.round(
      (originalAmount * tier.discount_percent) / 100,
    );
    const amount = Math.max(0, originalAmount - discountAmount);
    return {
      amount,
      discountAmount,
      discountPercent: tier.discount_percent,
      discountReason: `golden_hour:${tier.tier_name}`,
    };
  }

  /**
   * Wraps LoyaltyService.applyOrderNoShow with a logged catch — the order
   * has already been moved to NO_SHOW, so a loyalty hiccup must not roll
   * back the status transition or surface as a 500.
   */
  private async applyNoShowLoyaltyHookSafe(
    order: OrderDocument,
  ): Promise<void> {
    try {
      await this.loyaltyService.applyOrderNoShow(order.customer_id, order._id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Loyalty no-show hook failed orderId=${order._id.toString()} reason=${msg}`,
      );
    }
  }

  /**
   * Returns a voucher consumed on `order` to UNUSED so the customer can
   * redeem it on a later booking. Called on every path that flips an order
   * to CANCELLED (customer cancel, admin cancel, payment timeout, PayOS
   * webhook failure) — never on NO_SHOW, which intentionally burns the
   * voucher as a no-show penalty.
   *
   * Wrapped in try/catch + logger: the order status update has already
   * happened, so a refund hiccup must not bubble up as a 500 to the caller.
   * Worst case the customer support has to refund manually from the
   * voucher admin tool.
   */
  private async refundVoucherIfPresent(order: OrderDocument): Promise<void> {
    if (!order.voucher_id) return;
    try {
      await this.voucherService.refund(order.voucher_id);
      this.logger.log(
        `Refunded voucher voucherId=${order.voucher_id.toString()} orderId=${order._id.toString()}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Voucher refund failed orderId=${order._id.toString()} voucherId=${order.voucher_id.toString()} reason=${msg}`,
      );
    }
  }

  /**
   * Generates a unique PayOS orderCode using Redis INCR + a time-based base.
   * Unique index on Order.payos_order_code is the DB safety net.
   */
  private async generateOrderCode(): Promise<number> {
    const seq = await this.redis.incr('seq:order:code');
    if (seq === 1) {
      await this.redis.expire('seq:order:code', 60 * 60 * 24 * 365);
    }
    const base = Math.floor(Date.now() / 1000) * 1000;
    return base + (seq % 1000);
  }
}

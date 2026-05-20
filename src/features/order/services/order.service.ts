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
import { LoyaltyService } from '../../loyalty/loyalty.service';
import { ServiceTypeRepository } from '../../service-type/repositories/service-type.repository';
import { StaffShiftRepository } from '../../staff-shift/repositories/staff-shift.repository';
import { ShiftStatusEnum } from '../../staff-shift/types/shift-status.enum';
import { TierConfigRepository } from '../../tier-config/repositories/tier-config.repository';
import { VehicleRepository } from '../../vehicle/repositories/vehicle.repository';
import { CancelOrderDto } from '../dto/cancel-order.dto';
import { CreateOrderDto } from '../dto/create-order.dto';
import {
  OrderListResponseDto,
  OrderResponseDto,
} from '../dto/order-response.dto';
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

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly transactionRepository: PaymentTransactionRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly serviceTypeRepository: ServiceTypeRepository,
    private readonly staffShiftRepository: StaffShiftRepository,
    private readonly userRepository: UserRepository,
    private readonly tierConfigRepository: TierConfigRepository,
    private readonly loyaltyService: LoyaltyService,
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
    // 1) Vehicle ownership
    const vehicle = await this.vehicleRepository.findByIdForOwner(
      dto.vehicleId,
      customerId,
    );
    if (!vehicle || !vehicle.is_active) {
      throw new NotFoundException('Vehicle not found');
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
    let reservedShiftId: Types.ObjectId | undefined;
    for (const candidate of candidates) {
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

    // 7) Compute amount + initial states
    const amount = Math.round(parseFloat(service.base_price.toString()));
    const isOnline = dto.paymentMethod === PaymentMethodEnum.ONLINE;
    const initialStatus = isOnline
      ? OrderStatusEnum.PENDING_PAYMENT
      : OrderStatusEnum.CONFIRMED;
    const initialPaymentStatus = PaymentStatusEnum.UNPAID;

    // 8) Create order; rollback shift slot on failure
    let order: OrderDocument;
    try {
      const payosOrderCode = isOnline
        ? await this.generateOrderCode()
        : undefined;
      order = await this.orderRepository.create({
        customerId: new Types.ObjectId(customerId),
        vehicleId: new Types.ObjectId(dto.vehicleId),
        serviceTypeId: new Types.ObjectId(dto.serviceTypeId),
        staffShiftId: reservedShiftId,
        scheduledAt: dto.scheduledAt,
        priorityLevel: tier.priority_level,
        paymentMethod: dto.paymentMethod,
        paymentStatus: initialPaymentStatus,
        status: initialStatus,
        amount,
        note: dto.note,
        payosOrderCode,
      });
    } catch (err) {
      await this.staffShiftRepository.decrementCurrentBookings(reservedShiftId);
      throw err;
    }

    // 9) If online → create PayOS link (rollback on failure)
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

    // 10) Confirmation email:
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
          await this.orderRepository.updateById(order._id, {
            status: OrderStatusEnum.CANCELLED,
            cancelReason: 'Payment failed',
          });
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
    this.logger.log(
      `Staff updated order status orderId=${id} from=${order.status} to=${dto.status}`,
    );
    return OrderResponseDto.fromDocument(updated);
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
        await this.orderRepository.updateById(id, {
          status: OrderStatusEnum.NO_SHOW,
          cancelReason: 'No arrival within grace window',
        });
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
        await this.orderRepository.updateById(id, {
          status: OrderStatusEnum.CANCELLED,
          cancelReason: 'Payment timeout',
        });
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

/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
jest.mock('../../core/realtime', () => ({
  ...jest.requireActual<typeof import('../../core/realtime')>(
    '../../core/realtime',
  ),
  emitToOps: jest.fn(),
  emitToUser: jest.fn(),
  emitToCustomers: jest.fn(),
}));
jest.mock('../../core/redis', () => ({
  redisClient: {
    incr: jest.fn(async () => 42),
    expire: jest.fn(async () => 1),
  },
}));
jest.mock('../notification/notification.router', () => ({
  notificationService: { notifyUser: jest.fn(), notifyRoles: jest.fn() },
}));

import { Types } from 'mongoose';
import { OrderService } from './order.service';
import { CreateOrderDto } from '../../shared/order/dto/create-order.dto';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';
import { PaymentMethodEnum } from '../../shared/order/types/payment-method.enum';
import { PaymentStatusEnum } from '../../shared/order/types/payment-status.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { DiscountCalculationService } from '../pricing/discount-calculation.service';
import { VoucherEligibilityService } from '../pricing/voucher-eligibility.service';

const SERVICE_PRICE = 100_000;
// Mirrors config.booking.paymentTimeoutMinutes' default.
const PAYMENT_TIMEOUT_MINUTES = 15;
const vehicleTypeId = new Types.ObjectId();
const vehicleId = new Types.ObjectId();
const serviceTypeId = new Types.ObjectId();
const shiftId = new Types.ObjectId();
const customerId = new Types.ObjectId();

/**
 * Builds an OrderService whose collaborators are all stubs. The return type is
 * inferred rather than declared so each `jest.fn` keeps its argument types and
 * assertions on `mock.calls` stay type-checked.
 */
function makeHarness(voucherCapVnd: number) {
  const orderRepository = {
    countActiveByCustomer: jest.fn(async () => 0),
    findActiveByShifts: jest.fn(async () => []),
    // Echo the input back as a persisted document, translating the repository's
    // camelCase input into the snake_case column names the response DTO reads.
    create: jest.fn(async (input: Record<string, unknown>) => ({
      ...input,
      _id: input.id ?? new Types.ObjectId(),
      customer_id: input.customerId,
      vehicle_id: input.vehicleId,
      service_type_id: input.serviceTypeId,
      staff_shift_id: input.staffShiftId,
      scheduled_at: input.scheduledAt,
      estimated_minutes: input.estimatedMinutes,
      payment_status: input.paymentStatus,
      payment_method: input.paymentMethod,
      payos_order_code: input.payosOrderCode,
      original_amount: input.originalAmount,
      discount_amount: input.discountAmount,
      discount_percent: input.discountPercent,
      discount_reason: input.discountReason,
      voucher_id: input.voucherId,
      created_at: new Date(),
      updated_at: new Date(),
    })),
    updateById: jest.fn(async () => null),
  };
  const voucherService = {
    reserveForOrder: jest.fn(
      async (input: { orderId: Types.ObjectId; reservedUntil: Date }) => ({
        _id: new Types.ObjectId(),
        code: 'WASH-4KP9XM2A7B',
        discount_cap_vnd: voucherCapVnd,
        _reservedFor: input.orderId,
      }),
    ),
    redeemForOrder: jest.fn(async (_orderId: Types.ObjectId) => true),
    releaseForOrder: jest.fn(async (_orderId: Types.ObjectId) => true),
  };
  const payosService = {
    createPaymentLink: jest.fn(async () => ({
      checkoutUrl: 'https://pay.example/x',
      paymentLinkId: 'link-1',
    })),
  };

  // The REAL pricing engine, fed stub repositories. Wiring the genuine article
  // here is deliberate: it proves createOrder prices through the same code the
  // preview does, which is the whole point of extracting the engine.
  const discountCalculation = new DiscountCalculationService(
    new VoucherEligibilityService(
      {
        findById: jest.fn(async () => ({
          _id: new Types.ObjectId(),
          campaign_id: undefined,
          customer_id: customerId,
          code: 'WASH-4KP9XM2A7B',
          status: VoucherStatusEnum.UNUSED,
          discount_cap_vnd: voucherCapVnd,
          expires_at: new Date(Date.now() + 86_400_000),
        })),
        countByCampaignForCustomer: jest.fn(async () => 0),
      } as never,
      { findById: jest.fn(async () => null) } as never,
    ),
  );

  const service = new OrderService(
    orderRepository as never,
    {} as never,
    {
      findByIdForOwner: jest.fn(async () => ({
        _id: vehicleId,
        is_active: true,
        vehicle_type_id: vehicleTypeId,
      })),
    } as never,
    {} as never,
    {
      findById: jest.fn(async () => ({
        _id: serviceTypeId,
        name: 'Rửa xe cơ bản',
        is_active: true,
        is_voucher_eligible: true,
        vehicle_pricing: [
          {
            is_active: true,
            vehicle_type_id: vehicleTypeId,
            price: SERVICE_PRICE,
            estimated_minutes: 30,
          },
        ],
      })),
    } as never,
    {
      findShiftsContaining: jest.fn(async () => [
        { _id: shiftId, capacity: 5 },
      ]),
    } as never,
    {
      findById: jest.fn(async () => ({ email: 'a@example.com', name: 'A' })),
    } as never,
    {
      findById: jest.fn(async () => ({
        booking_window_days: 14,
        priority_level: 0,
        discount_percent: 0,
      })),
    } as never,
    {
      ensureForCustomer: jest.fn(async () => ({
        tier_config_id: new Types.ObjectId(),
      })),
    } as never,
    voucherService as never,
    // No golden hour → no promotion/tier discount, so the voucher is the only
    // thing moving the price. Keeps each assertion about one variable.
    { findActiveAt: jest.fn(async () => null) } as never,
    payosService as never,
    { sendOrderConfirmationEmail: jest.fn(async () => undefined) } as never,
    { getMaxStackedDiscountPercent: jest.fn(async () => 30) } as never,
    {} as never,
    {} as never,
    discountCalculation,
  );

  return { service, orderRepository, voucherService, payosService };
}

function dtoFor(paymentMethod: PaymentMethodEnum): CreateOrderDto {
  return {
    vehicleId: vehicleId.toString(),
    serviceTypeId: serviceTypeId.toString(),
    scheduledAt: new Date(Date.now() + 3_600_000),
    paymentMethod,
    voucherId: new Types.ObjectId().toString(),
  };
}

describe('OrderService.createOrder — voucher reservation', () => {
  beforeEach(() => jest.clearAllMocks());

  it('reserves against the id the order is actually saved under', async () => {
    // Regression: the redeem call used to receive a throwaway ObjectId, so
    // every voucher.used_order_id pointed at an order that never existed.
    const h = makeHarness(30_000);
    const result = await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.CASH),
    );

    const heldFor = h.voucherService.reserveForOrder.mock.calls[0][0].orderId;
    const persistedId = h.orderRepository.create.mock.calls[0][0].id;

    expect(heldFor.toString()).toBe(String(persistedId));
    expect(result.id).toBe(String(persistedId));
  });

  it('leaves an online order holding the voucher until payment lands', async () => {
    // The whole point of the hold: an abandoned checkout must not burn the
    // voucher the way booking-time redemption did.
    const h = makeHarness(30_000);
    await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.ONLINE),
    );

    expect(h.voucherService.reserveForOrder).toHaveBeenCalledTimes(1);
    expect(h.voucherService.redeemForOrder).not.toHaveBeenCalled();
  });

  it('settles the hold immediately for a cash order, which is confirmed at once', async () => {
    const h = makeHarness(30_000);
    await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.CASH),
    );

    expect(h.voucherService.redeemForOrder).toHaveBeenCalledTimes(1);
  });

  it('holds the voucher past the payment window so the sweep cannot race it', async () => {
    const h = makeHarness(30_000);
    await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.ONLINE),
    );

    const { reservedUntil } = h.voucherService.reserveForOrder.mock.calls[0][0];
    expect(reservedUntil.getTime()).toBeGreaterThan(
      Date.now() + PAYMENT_TIMEOUT_MINUTES * 60_000,
    );
  });

  it('releases the hold when persisting the order fails', async () => {
    const h = makeHarness(30_000);
    h.orderRepository.create.mockRejectedValueOnce(new Error('db down'));

    await expect(
      h.service.createOrder(
        customerId.toString(),
        dtoFor(PaymentMethodEnum.CASH),
      ),
    ).rejects.toThrow('db down');
    expect(h.voucherService.releaseForOrder).toHaveBeenCalledTimes(1);
  });
});

describe('OrderService.createOrder — fully discounted orders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('settles an online order at 0đ without calling the payment gateway', async () => {
    // Previously this threw "please pay in cash at the counter".
    const h = makeHarness(SERVICE_PRICE);
    const result = await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.ONLINE),
    );

    expect(result.amount).toBe(0);
    expect(result.status).toBe(OrderStatusEnum.CONFIRMED);
    expect(result.paymentStatus).toBe(PaymentStatusEnum.NO_PAYMENT_REQUIRED);
    expect(h.payosService.createPaymentLink).not.toHaveBeenCalled();
  });

  it('does not mint a PayOS order code for a 0đ order', async () => {
    const h = makeHarness(SERVICE_PRICE);
    await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.ONLINE),
    );

    expect(
      h.orderRepository.create.mock.calls[0][0].payosOrderCode,
    ).toBeUndefined();
  });

  it('settles a cash order at 0đ instead of leaving money owed at the counter', async () => {
    const h = makeHarness(SERVICE_PRICE);
    const result = await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.CASH),
    );

    expect(result.amount).toBe(0);
    expect(result.paymentStatus).toBe(PaymentStatusEnum.NO_PAYMENT_REQUIRED);
  });

  it('never lets a voucher larger than the order push the total negative', async () => {
    const h = makeHarness(500_000);
    const result = await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.CASH),
    );

    expect(result.amount).toBe(0);
    expect(result.discountAmount).toBe(SERVICE_PRICE);
  });

  it('still routes a partially discounted online order through PayOS', async () => {
    const h = makeHarness(30_000);
    const result = await h.service.createOrder(
      customerId.toString(),
      dtoFor(PaymentMethodEnum.ONLINE),
    );

    expect(result.amount).toBe(SERVICE_PRICE - 30_000);
    expect(result.status).toBe(OrderStatusEnum.PENDING_PAYMENT);
    expect(result.paymentStatus).toBe(PaymentStatusEnum.UNPAID);
    expect(h.payosService.createPaymentLink).toHaveBeenCalledTimes(1);
  });
});

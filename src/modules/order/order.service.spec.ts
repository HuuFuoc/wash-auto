jest.mock('../../core/realtime', () => ({
  ...jest.requireActual<typeof import('../../core/realtime')>(
    '../../core/realtime',
  ),
  emitToOps: jest.fn(),
  emitToUser: jest.fn(),
  emitToCustomers: jest.fn(),
}));

import { Types } from 'mongoose';
import {
  RealtimeEvent,
  emitToCustomers,
  emitToOps,
  emitToUser,
} from '../../core/realtime';
import {
  customerWasherView,
  emitOrderStatus,
  emitSlotsChanged,
  goldenHourSlotView,
  vnDateOf,
} from './order.service';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';

describe('customerWasherView', () => {
  const orderId = new Types.ObjectId().toString();
  const washerId = new Types.ObjectId();
  const wo = {
    assigned_washer_id: {
      _id: washerId,
      name: 'Nguyễn Văn Bình',
      phone: '0986307720',
    },
    status: 'done',
  };
  const ratings = new Map([[washerId.toString(), { averageRating: 4.6 }]]);

  it('exposes washer name/phone/overall rating and allows rating a completed, unrated order', () => {
    const view = customerWasherView(
      wo,
      ratings,
      new Map(),
      orderId,
      OrderStatusEnum.COMPLETED,
    );
    expect(view.washerName).toBe('Nguyễn Văn Bình');
    expect(view.washerPhone).toBe('0986307720');
    expect(view.washerAvgRating).toBe(4.6);
    expect(view.orderRating).toBeUndefined();
    expect(view.canRate).toBe(true);
    expect(view.alreadyRated).toBe(false);
  });

  it('returns the order own rating and disables re-rating once rated', () => {
    const view = customerWasherView(
      wo,
      ratings,
      new Map([[orderId, 5]]),
      orderId,
      OrderStatusEnum.COMPLETED,
    );
    expect(view.orderRating).toBe(5);
    expect(view.alreadyRated).toBe(true);
    expect(view.canRate).toBe(false);
  });

  it('disables rating for an order that is not completed', () => {
    const view = customerWasherView(
      wo,
      ratings,
      new Map(),
      orderId,
      OrderStatusEnum.IN_PROGRESS,
    );
    expect(view.canRate).toBe(false);
  });

  it('handles an order with no work order yet', () => {
    const view = customerWasherView(
      undefined,
      ratings,
      new Map(),
      orderId,
      OrderStatusEnum.CONFIRMED,
    );
    expect(view.washerId).toBeUndefined();
    expect(view.canRate).toBe(false);
  });
});

describe('goldenHourSlotView', () => {
  const windowDoc = (discountPercent: number) =>
    ({ discount_percent: discountPercent }) as never;

  it('does not flag a slot golden when its window discounts nothing', () => {
    // A 0% window pays no promotion, and the tier only pays inside a window
    // that discounts — so the slot must advertise nothing, or the customer is
    // quoted a discount that vanishes at the payment step.
    expect(goldenHourSlotView(windowDoc(0), 5, 50)).toEqual({
      isGoldenHour: false,
      discountPercent: 0,
    });
  });

  it('advertises window + tier for a discounting window', () => {
    expect(goldenHourSlotView(windowDoc(10), 5, 50)).toEqual({
      isGoldenHour: true,
      discountPercent: 15,
    });
  });

  it('never advertises more than the pricing-policy cap', () => {
    expect(goldenHourSlotView(windowDoc(40), 5, 30)).toEqual({
      isGoldenHour: true,
      discountPercent: 30,
    });
  });

  it('is not golden outside every window', () => {
    expect(goldenHourSlotView(null, 5, 50)).toEqual({
      isGoldenHour: false,
      discountPercent: 0,
    });
  });
});

describe('realtime order emit helpers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('vnDateOf converts an instant to the Vietnam-local calendar date', () => {
    // 2026-07-15T17:30Z = 2026-07-16 00:30 UTC+7 → sang ngày hôm sau.
    expect(vnDateOf(new Date('2026-07-15T17:30:00.000Z'))).toBe('2026-07-16');
    expect(vnDateOf(new Date('2026-07-15T09:00:00.000Z'))).toBe('2026-07-15');
  });

  it('emitOrderStatus sends the full DTO to ops and to the order owner', () => {
    const customerId = new Types.ObjectId();
    const order = {
      _id: new Types.ObjectId(),
      customer_id: customerId,
      status: OrderStatusEnum.CONFIRMED,
      scheduled_at: new Date('2026-07-15T09:00:00.000Z'),
      amount: 120_000,
      created_at: new Date(),
      updated_at: new Date(),
    };

    emitOrderStatus(order as never);

    expect(emitToOps).toHaveBeenCalledTimes(1);
    const [opsEvent, opsPayload] = (emitToOps as jest.Mock).mock.calls[0] as [
      string,
      { id: string; status: OrderStatusEnum },
    ];
    expect(opsEvent).toBe(RealtimeEvent.ORDER_STATUS);
    expect(opsPayload).toMatchObject({
      id: order._id.toString(),
      status: OrderStatusEnum.CONFIRMED,
    });

    expect(emitToUser).toHaveBeenCalledWith(
      customerId.toString(),
      RealtimeEvent.ORDER_STATUS,
      opsPayload,
    );
  });

  it('emitSlotsChanged broadcasts the affected VN date to customers', () => {
    emitSlotsChanged(new Date('2026-07-15T17:30:00.000Z'));
    expect(emitToCustomers).toHaveBeenCalledWith(RealtimeEvent.SLOTS_CHANGED, {
      date: '2026-07-16',
    });
  });
});

import { Types } from 'mongoose';
import { customerWasherView } from './order.service';
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

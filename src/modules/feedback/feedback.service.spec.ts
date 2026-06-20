/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import { Types } from 'mongoose';
import { FeedbackService } from './feedback.service';
import { OrderStatusEnum } from '../../shared/order/types/order-status.enum';
import {
  BadRequestException,
  ForbiddenException,
} from '../../common/exceptions';

describe('FeedbackService', () => {
  const customerId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const washerId = new Types.ObjectId();
  const workOrderId = new Types.ObjectId();

  function build(
    overrides: {
      order?: Record<string, unknown>;
      workOrder?: Record<string, unknown> | null;
      existing?: Record<string, unknown> | null;
      orderNull?: boolean;
    } = {},
  ) {
    const order = {
      _id: orderId,
      customer_id: customerId,
      status: OrderStatusEnum.COMPLETED,
      ...overrides.order,
    };
    const workOrder =
      overrides.workOrder === null
        ? null
        : {
            _id: workOrderId,
            order_id: orderId,
            assigned_washer_id: washerId,
            ...overrides.workOrder,
          };

    const orderRepository = {
      findById: jest.fn(async () => (overrides.orderNull ? null : order)),
    };
    const workOrderRepository = {
      findByOrderId: jest.fn(async () => workOrder),
    };
    const feedbackRepository = {
      findByOrderId: jest.fn(async () => overrides.existing ?? null),
      upsertByOrder: jest.fn(async (input: Record<string, unknown>) => ({
        _id: new Types.ObjectId(),
        order_id: orderId,
        work_order_id: workOrderId,
        customer_id: customerId,
        washer_id: input.washerId,
        rating: input.rating,
        comment: input.comment,
        created_at: new Date(),
        updated_at: new Date(),
      })),
      summaryByWasher: jest.fn(async () => ({
        averageRating: 4.5,
        count: 2,
        distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 1 },
      })),
    };

    const service = new FeedbackService(
      feedbackRepository as never,
      orderRepository as never,
      workOrderRepository as never,
    );
    return {
      service,
      feedbackRepository,
      orderRepository,
      workOrderRepository,
    };
  }

  it('rejects feedback on an order that is not completed', async () => {
    const { service } = build({
      order: { status: OrderStatusEnum.IN_PROGRESS },
    });
    await expect(
      service.submit(customerId.toString(), {
        orderId: orderId.toString(),
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects feedback from someone who does not own the order', async () => {
    const { service } = build({ order: { customer_id: new Types.ObjectId() } });
    await expect(
      service.submit(customerId.toString(), {
        orderId: orderId.toString(),
        rating: 5,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('upserts feedback attributed to the order washer', async () => {
    const { service, feedbackRepository } = build();
    const result = await service.submit(customerId.toString(), {
      orderId: orderId.toString(),
      rating: 4,
      comment: 'ok',
    });
    expect(feedbackRepository.upsertByOrder).toHaveBeenCalledTimes(1);
    expect(result.rating).toBe(4);
    expect(result.washerId).toBe(washerId.toString());
    expect(result.orderId).toBe(orderId.toString());
  });

  it('reports eligibility for a completed, not-yet-rated order', async () => {
    const { service } = build();
    const res = await service.getForOrder(
      customerId.toString(),
      orderId.toString(),
    );
    expect(res.eligible).toBe(true);
    expect(res.alreadyRated).toBe(false);
    expect(res.feedback).toBeNull();
  });

  it('returns a washer rating summary', async () => {
    const { service } = build();
    const summary = await service.washerSummary(washerId.toString());
    expect(summary.averageRating).toBe(4.5);
    expect(summary.count).toBe(2);
  });
});

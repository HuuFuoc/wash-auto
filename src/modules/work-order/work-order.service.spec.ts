/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import { Types } from 'mongoose';
import { WorkOrderService } from './work-order.service';
import { WorkOrderStatusEnum } from '../../shared/work-order/types/work-order-status.enum';
import { ForbiddenException } from '../../common/exceptions';

/**
 * Focused unit test for the post-QC wash lifecycle: a washer finishing the
 * wash must complete the work order AND the order in one step (no manager QC).
 */
describe('WorkOrderService.finish (QC removed)', () => {
  const woId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const washerId = new Types.ObjectId();

  function buildService() {
    const baseDoc = {
      _id: woId,
      order_id: orderId,
      code: 'WO-20260619-001',
      vehicle_snapshot: { plate: '51A-12345', vehicle_type_name: 'Car' },
      service_name: 'Standard Wash',
      scheduled_at: new Date(),
      checkin_photos: [],
      checkout_photos: [],
      status: WorkOrderStatusEnum.IN_PROGRESS,
      assigned_washer_id: washerId,
      estimated_minutes: 30,
      started_at: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };

    const repository = {
      findById: jest.fn(async () => baseDoc),
      updateById: jest.fn(
        async (_id: string, patch: Record<string, unknown>) => ({
          ...baseDoc,
          status: patch.status,
          finished_at: patch.finishedAt,
          checkout_photos: patch.checkoutPhotos,
        }),
      ),
    };
    const orderService = {
      markCompletedByWorkOrder: jest.fn(async () => undefined),
    };
    const assignmentService = {
      tryPullNextForWasher: jest.fn(async () => undefined),
    };

    const service = new WorkOrderService(
      repository as never,
      {} as never,
      orderService as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      assignmentService as never,
    );
    return { service, repository, orderService };
  }

  it('moves an in-progress work order straight to DONE', async () => {
    const { service, repository } = buildService();
    const result = await service.finish(washerId.toString(), woId.toString(), [
      'https://cdn/checkout.jpg',
    ]);
    expect(result.status).toBe(WorkOrderStatusEnum.DONE);
    expect(repository.updateById).toHaveBeenCalledWith(
      woId.toString(),
      expect.objectContaining({ status: WorkOrderStatusEnum.DONE }),
    );
  });

  it('completes the underlying order (loyalty hook) on finish', async () => {
    const { service, orderService } = buildService();
    await service.finish(washerId.toString(), woId.toString(), [
      'https://cdn/checkout.jpg',
    ]);
    expect(orderService.markCompletedByWorkOrder).toHaveBeenCalledWith(orderId);
  });
});

describe('WorkOrderService.getForCustomerByOrder (who washed my car)', () => {
  const customerId = new Types.ObjectId();
  const orderId = new Types.ObjectId();
  const washerId = new Types.ObjectId();

  function buildService(orderCustomerId = customerId) {
    const order = { _id: orderId, customer_id: orderCustomerId };
    const workOrder = {
      _id: new Types.ObjectId(),
      order_id: orderId,
      code: 'WO-1',
      vehicle_snapshot: { plate: '51A-1', vehicle_type_name: 'Car' },
      service_name: 'Wash',
      scheduled_at: new Date(),
      checkin_photos: [],
      checkout_photos: [],
      status: WorkOrderStatusEnum.IN_PROGRESS,
      assigned_washer_id: { _id: washerId, name: 'Trần Văn B' },
      estimated_minutes: 30,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const repository = {
      findByOrderIdWithWasher: jest.fn(async () => workOrder),
    };
    const orderRepository = { findById: jest.fn(async () => order) };
    const service = new WorkOrderService(
      repository as never,
      orderRepository as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    return { service };
  }

  it('returns the assigned washer name for the order owner', async () => {
    const { service } = buildService();
    const result = await service.getForCustomerByOrder(
      customerId.toString(),
      orderId.toString(),
    );
    expect(result.assignedWasherName).toBe('Trần Văn B');
    expect(result.status).toBe(WorkOrderStatusEnum.IN_PROGRESS);
  });

  it('forbids viewing a work order for an order you do not own', async () => {
    const { service } = buildService(new Types.ObjectId());
    await expect(
      service.getForCustomerByOrder(customerId.toString(), orderId.toString()),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

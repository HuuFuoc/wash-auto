import { Types } from 'mongoose';
import { WorkOrderStatusEnum } from '../../features/work-order/types/work-order-status.enum';
import {
  IVehicleSnapshot,
  WorkOrderDocument,
  WorkOrderModel,
} from './work-order.model';

export interface ICreateWorkOrderInput {
  orderId: Types.ObjectId;
  code: string;
  vehicleSnapshot: IVehicleSnapshot;
  serviceName: string;
  serviceTypeId: Types.ObjectId;
  vehicleTypeId: Types.ObjectId;
  scheduledAt: Date;
  preferredWasherId?: Types.ObjectId;
  checkinPhotos?: string[];
  estimatedMinutes: number;
  stationName?: string;
}

/** Work-order statuses that tie up a washer (cannot take another car). */
export const BUSY_WASHER_STATUSES = [
  WorkOrderStatusEnum.ASSIGNED,
  WorkOrderStatusEnum.IN_PROGRESS,
  WorkOrderStatusEnum.RETURNED,
];

export interface IUpdateWorkOrderInput {
  status?: WorkOrderStatusEnum;
  assignedWasherId?: Types.ObjectId;
  assignedBy?: Types.ObjectId;
  checkoutPhotos?: string[];
  startedAt?: Date;
  finishedAt?: Date;
  qcBy?: Types.ObjectId;
  qcAt?: Date;
  qcPassed?: boolean;
  qcNote?: string;
  returnCount?: number;
}

export interface IWorkOrderListFilter {
  status?: WorkOrderStatusEnum;
  assignedWasherId?: Types.ObjectId;
}

type WorkOrderQuery = {
  status?: WorkOrderStatusEnum;
  assigned_washer_id?: Types.ObjectId;
};

export class WorkOrderRepository {
  async create(input: ICreateWorkOrderInput): Promise<WorkOrderDocument> {
    return WorkOrderModel.create({
      order_id: input.orderId,
      code: input.code,
      vehicle_snapshot: input.vehicleSnapshot,
      service_name: input.serviceName,
      service_type_id: input.serviceTypeId,
      vehicle_type_id: input.vehicleTypeId,
      scheduled_at: input.scheduledAt,
      preferred_washer_id: input.preferredWasherId,
      checkin_photos: input.checkinPhotos ?? [],
      status: WorkOrderStatusEnum.WAITING,
      estimated_minutes: input.estimatedMinutes,
      station_name: input.stationName,
      return_count: 0,
    });
  }

  /** FIFO queue: WAITING tickets ordered by appointment time, then arrival. */
  async findWaitingQueue(limit = 100): Promise<WorkOrderDocument[]> {
    return WorkOrderModel.find({ status: WorkOrderStatusEnum.WAITING })
      .sort({ scheduled_at: 1, created_at: 1 })
      .limit(limit)
      .exec();
  }

  /** Atomically claims a WAITING ticket for a washer (WAITING → ASSIGNED). */
  async claimForWasher(
    id: Types.ObjectId | string,
    washerId: Types.ObjectId | string,
    assignedBy?: Types.ObjectId | string,
  ): Promise<WorkOrderDocument | null> {
    return WorkOrderModel.findOneAndUpdate(
      { _id: id, status: WorkOrderStatusEnum.WAITING },
      {
        $set: {
          status: WorkOrderStatusEnum.ASSIGNED,
          assigned_washer_id: new Types.ObjectId(washerId),
          ...(assignedBy ? { assigned_by: new Types.ObjectId(assignedBy) } : {}),
        },
      },
      { returnDocument: 'after' },
    ).exec();
  }

  /** Of the given washers, the subset currently tied up. */
  async findBusyWasherIds(
    washerIds: Array<Types.ObjectId | string>,
  ): Promise<Set<string>> {
    if (washerIds.length === 0) return new Set();
    const ids = await WorkOrderModel.distinct('assigned_washer_id', {
      assigned_washer_id: { $in: washerIds.map((w) => new Types.ObjectId(w)) },
      status: { $in: BUSY_WASHER_STATUSES },
    }).exec();
    return new Set((ids as Types.ObjectId[]).map((id) => id.toString()));
  }

  /** Most recent `finished_at` per washer, for the idle-longest tiebreak. */
  async findLastFinishedAtByWashers(
    washerIds: Array<Types.ObjectId | string>,
  ): Promise<Map<string, Date>> {
    const result = new Map<string, Date>();
    if (washerIds.length === 0) return result;
    const rows = await WorkOrderModel.aggregate<{
      _id: Types.ObjectId;
      lastFinishedAt: Date;
    }>([
      {
        $match: {
          assigned_washer_id: {
            $in: washerIds.map((w) => new Types.ObjectId(w)),
          },
          finished_at: { $ne: null },
        },
      },
      {
        $group: {
          _id: '$assigned_washer_id',
          lastFinishedAt: { $max: '$finished_at' },
        },
      },
    ]).exec();
    for (const row of rows) {
      result.set(row._id.toString(), row.lastFinishedAt);
    }
    return result;
  }

  /** Work orders currently tying up `washerId` — ASSIGNED or IN_PROGRESS (busy). */
  async findActiveByWasher(
    washerId: Types.ObjectId | string,
    excludeId?: Types.ObjectId | string,
  ): Promise<WorkOrderDocument[]> {
    return WorkOrderModel.find({
      assigned_washer_id: new Types.ObjectId(washerId),
      status: { $in: BUSY_WASHER_STATUSES },
      ...(excludeId && Types.ObjectId.isValid(excludeId)
        ? { _id: { $ne: new Types.ObjectId(excludeId) } }
        : {}),
    }).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<WorkOrderDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return WorkOrderModel.findById(id).exec();
  }

  async findByOrderId(
    orderId: Types.ObjectId | string,
  ): Promise<WorkOrderDocument | null> {
    if (!Types.ObjectId.isValid(orderId)) return null;
    return WorkOrderModel.findOne({ order_id: orderId }).exec();
  }

  async findByAssignedWasher(
    washerId: Types.ObjectId | string,
  ): Promise<WorkOrderDocument[]> {
    return WorkOrderModel.find({
      assigned_washer_id: new Types.ObjectId(washerId),
    })
      .sort({ created_at: -1 })
      .exec();
  }

  async findPaginated(
    filter: IWorkOrderListFilter,
    page: number,
    limit: number,
  ): Promise<WorkOrderDocument[]> {
    const skip = (page - 1) * limit;
    return WorkOrderModel.find(this.buildQuery(filter))
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('assigned_washer_id', 'name')
      .exec();
  }

  async countMatching(filter: IWorkOrderListFilter): Promise<number> {
    return WorkOrderModel.countDocuments(this.buildQuery(filter)).exec();
  }

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateWorkOrderInput,
  ): Promise<WorkOrderDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.status !== undefined) update.status = input.status;
    if (input.assignedWasherId !== undefined)
      update.assigned_washer_id = input.assignedWasherId;
    if (input.assignedBy !== undefined) update.assigned_by = input.assignedBy;
    if (input.checkoutPhotos !== undefined)
      update.checkout_photos = input.checkoutPhotos;
    if (input.startedAt !== undefined) update.started_at = input.startedAt;
    if (input.finishedAt !== undefined) update.finished_at = input.finishedAt;
    if (input.qcBy !== undefined) update.qc_by = input.qcBy;
    if (input.qcAt !== undefined) update.qc_at = input.qcAt;
    if (input.qcPassed !== undefined) update.qc_passed = input.qcPassed;
    if (input.qcNote !== undefined) update.qc_note = input.qcNote;
    if (input.returnCount !== undefined) update.return_count = input.returnCount;

    return WorkOrderModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  private buildQuery(filter: IWorkOrderListFilter): WorkOrderQuery {
    const q: WorkOrderQuery = {};
    if (filter.status) q.status = filter.status;
    if (filter.assignedWasherId) q.assigned_washer_id = filter.assignedWasherId;
    return q;
  }
}

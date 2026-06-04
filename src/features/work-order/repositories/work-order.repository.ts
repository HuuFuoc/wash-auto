import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  IChecklistItem,
  IVehicleSnapshot,
  WorkOrder,
  WorkOrderDocument,
} from '../entities/work-order.entity';
import { WorkOrderStatusEnum } from '../types/work-order-status.enum';

export interface ICreateWorkOrderInput {
  orderId: Types.ObjectId;
  code: string;
  vehicleSnapshot: IVehicleSnapshot;
  serviceName: string;
  checklist: IChecklistItem[];
  checkinPhotos?: string[];
  estimatedMinutes: number;
  stationName?: string;
}

export interface IUpdateWorkOrderInput {
  status?: WorkOrderStatusEnum;
  assignedWasherId?: Types.ObjectId;
  assignedBy?: Types.ObjectId;
  checklist?: IChecklistItem[];
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

@Injectable()
export class WorkOrderRepository {
  constructor(
    @InjectModel(WorkOrder.name)
    private readonly model: Model<WorkOrderDocument>,
  ) {}

  async create(input: ICreateWorkOrderInput): Promise<WorkOrderDocument> {
    return this.model.create({
      order_id: input.orderId,
      code: input.code,
      vehicle_snapshot: input.vehicleSnapshot,
      service_name: input.serviceName,
      checklist: input.checklist,
      checkin_photos: input.checkinPhotos ?? [],
      status: WorkOrderStatusEnum.WAITING,
      estimated_minutes: input.estimatedMinutes,
      station_name: input.stationName,
      return_count: 0,
    });
  }

  /**
   * Work orders currently tying up `washerId` — ASSIGNED or IN_PROGRESS.
   * Used to stop a busy washer being handed a second car. `excludeId` skips
   * the work order being (re)assigned so re-assigning the same ticket is fine.
   */
  async findActiveByWasher(
    washerId: Types.ObjectId | string,
    excludeId?: Types.ObjectId | string,
  ): Promise<WorkOrderDocument[]> {
    return this.model
      .find({
        assigned_washer_id: new Types.ObjectId(washerId),
        status: {
          $in: [WorkOrderStatusEnum.ASSIGNED, WorkOrderStatusEnum.IN_PROGRESS],
        },
        ...(excludeId && Types.ObjectId.isValid(excludeId)
          ? { _id: { $ne: new Types.ObjectId(excludeId) } }
          : {}),
      })
      .exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<WorkOrderDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByOrderId(
    orderId: Types.ObjectId | string,
  ): Promise<WorkOrderDocument | null> {
    if (!Types.ObjectId.isValid(orderId)) return null;
    return this.model.findOne({ order_id: orderId }).exec();
  }

  async findByAssignedWasher(
    washerId: Types.ObjectId | string,
  ): Promise<WorkOrderDocument[]> {
    return this.model
      .find({ assigned_washer_id: new Types.ObjectId(washerId) })
      .sort({ created_at: -1 })
      .exec();
  }

  async findPaginated(
    filter: IWorkOrderListFilter,
    page: number,
    limit: number,
  ): Promise<WorkOrderDocument[]> {
    const skip = (page - 1) * limit;
    return this.model
      .find(this.buildQuery(filter))
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('assigned_washer_id', 'name')
      .exec();
  }

  async countMatching(filter: IWorkOrderListFilter): Promise<number> {
    return this.model.countDocuments(this.buildQuery(filter)).exec();
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
    if (input.checklist !== undefined) update.checklist = input.checklist;
    if (input.startedAt !== undefined) update.started_at = input.startedAt;
    if (input.finishedAt !== undefined) update.finished_at = input.finishedAt;
    if (input.qcBy !== undefined) update.qc_by = input.qcBy;
    if (input.qcAt !== undefined) update.qc_at = input.qcAt;
    if (input.qcPassed !== undefined) update.qc_passed = input.qcPassed;
    if (input.qcNote !== undefined) update.qc_note = input.qcNote;
    if (input.returnCount !== undefined)
      update.return_count = input.returnCount;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  private buildQuery(filter: IWorkOrderListFilter): WorkOrderQuery {
    const q: WorkOrderQuery = {};
    if (filter.status) q.status = filter.status;
    if (filter.assignedWasherId) q.assigned_washer_id = filter.assignedWasherId;
    return q;
  }
}

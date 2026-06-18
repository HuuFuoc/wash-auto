import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { WorkOrderStatusEnum } from '../../shared/work-order/types/work-order-status.enum';

/** Vehicle details copied at check-in so the ticket is stable. */
export interface IVehicleSnapshot {
  plate: string;
  vehicle_type_name: string;
  color?: string;
}

// Plain-Mongoose rewrite of features/work-order/entities/work-order.entity.ts.
export interface WorkOrder {
  order_id: Types.ObjectId;
  code: string;
  vehicle_snapshot: IVehicleSnapshot;
  service_name: string;
  service_type_id: Types.ObjectId;
  vehicle_type_id: Types.ObjectId;
  scheduled_at: Date;
  preferred_washer_id?: Types.ObjectId;
  checkin_photos: string[];
  checkout_photos: string[];
  status: WorkOrderStatusEnum;
  assigned_washer_id?: Types.ObjectId;
  assigned_by?: Types.ObjectId;
  estimated_minutes: number;
  station_name?: string;
  started_at?: Date;
  finished_at?: Date;
  qc_by?: Types.ObjectId;
  qc_at?: Date;
  qc_passed?: boolean;
  qc_note?: string;
  return_count: number;
}

export type WorkOrderDocument = HydratedDocument<WorkOrder>;

const vehicleSnapshotSchema = new Schema<IVehicleSnapshot>(
  {
    plate: { type: String, required: true },
    vehicle_type_name: { type: String, required: true },
    color: { type: String },
  },
  { _id: false },
);

const workOrderSchema = new Schema<WorkOrder>(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    code: { type: String, required: true, unique: true, trim: true },
    vehicle_snapshot: { type: vehicleSnapshotSchema, required: true },
    service_name: { type: String, required: true, trim: true },
    service_type_id: {
      type: Schema.Types.ObjectId,
      ref: 'ServiceType',
      required: true,
      index: true,
    },
    vehicle_type_id: {
      type: Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: true,
    },
    scheduled_at: { type: Date, required: true },
    preferred_washer_id: { type: Schema.Types.ObjectId, ref: 'User' },
    checkin_photos: { type: [String], default: [] },
    checkout_photos: { type: [String], default: [] },
    status: {
      type: String,
      required: true,
      enum: Object.values(WorkOrderStatusEnum),
      default: WorkOrderStatusEnum.WAITING,
      index: true,
    },
    assigned_washer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    assigned_by: { type: Schema.Types.ObjectId, ref: 'User' },
    estimated_minutes: { type: Number, required: true, min: 1 },
    station_name: { type: String, trim: true },
    started_at: { type: Date },
    finished_at: { type: Date },
    qc_by: { type: Schema.Types.ObjectId, ref: 'User' },
    qc_at: { type: Date },
    qc_passed: { type: Boolean },
    qc_note: { type: String, trim: true },
    return_count: { type: Number, required: true, default: 0, min: 0 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'work_orders',
  },
);

workOrderSchema.index({ assigned_washer_id: 1, status: 1 });
workOrderSchema.index({ status: 1, scheduled_at: 1, created_at: 1 });

export const WorkOrderModel = model<WorkOrder>('WorkOrder', workOrderSchema);

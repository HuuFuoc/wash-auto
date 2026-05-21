import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { WorkOrderStatusEnum } from '../types/work-order-status.enum';

export type WorkOrderDocument = HydratedDocument<WorkOrder>;

/** Vehicle details copied at check-in so the job ticket is stable even if
 *  the customer later edits or deletes the vehicle. */
export interface IVehicleSnapshot {
  plate: string;
  vehicle_type_name: string;
  color?: string;
}

/** One step the washer ticks off. Built from the service `checklist_template`. */
export interface IChecklistItem {
  label: string;
  done: boolean;
  done_at?: Date;
}

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'work_orders',
})
export class WorkOrder {
  /** The booking this job ticket belongs to. One work order per order. */
  @Prop({
    type: Types.ObjectId,
    ref: 'Order',
    required: true,
    unique: true,
    index: true,
  })
  order_id: Types.ObjectId;

  /** Human-readable ticket code, e.g. WO-20260522-001. */
  @Prop({ required: true, unique: true, trim: true })
  code: string;

  @Prop({
    type: { plate: String, vehicle_type_name: String, color: String },
    required: true,
  })
  vehicle_snapshot: IVehicleSnapshot;

  @Prop({ required: true, trim: true })
  service_name: string;

  @Prop({
    type: [{ label: String, done: Boolean, done_at: Date }],
    default: [],
  })
  checklist: IChecklistItem[];

  @Prop({
    type: String,
    required: true,
    enum: Object.values(WorkOrderStatusEnum),
    default: WorkOrderStatusEnum.WAITING,
    index: true,
  })
  status: WorkOrderStatusEnum;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  assigned_washer_id?: Types.ObjectId;

  /** Cashier/manager who assigned the washer. */
  @Prop({ type: Types.ObjectId, ref: 'User' })
  assigned_by?: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  estimated_minutes: number;

  @Prop({ trim: true })
  station_name?: string;

  @Prop()
  started_at?: Date;

  @Prop()
  finished_at?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  qc_by?: Types.ObjectId;

  @Prop()
  qc_at?: Date;

  @Prop()
  qc_passed?: boolean;

  @Prop({ trim: true })
  qc_note?: string;

  /** How many times QC sent this ticket back. */
  @Prop({ required: true, default: 0, min: 0 })
  return_count: number;
}

export const WorkOrderSchema = SchemaFactory.createForClass(WorkOrder);
WorkOrderSchema.index({ assigned_washer_id: 1, status: 1 });

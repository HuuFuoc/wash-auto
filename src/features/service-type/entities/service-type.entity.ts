import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ServiceTypeDocument = HydratedDocument<ServiceType>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'service_types',
})
export class ServiceType {
  @Prop({ required: true, unique: true, trim: true, index: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: Types.Decimal128, required: true })
  base_price: Types.Decimal128;

  @Prop({ required: true, min: 1 })
  estimated_minutes: number;

  @Prop({ required: true, min: 0 })
  points_multiplier: number;

  /** Wash steps copied into a work order's checklist at check-in. */
  @Prop({ type: [String], default: [] })
  checklist_template: string[];

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const ServiceTypeSchema = SchemaFactory.createForClass(ServiceType);

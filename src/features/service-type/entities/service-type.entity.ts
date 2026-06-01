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

  /**
   * Whether a FREE_WASH voucher may be redeemed on this service. Defaults
   * to true so existing services keep working. Admin should flip this to
   * false on premium-priced services (e.g. Detailing) where a 100k voucher
   * cap stacked with Gold golden-hour discount would shrink margin to
   * unsafe levels - see docs/ECONOMIC_GUARDRAILS.md §4.
   */
  @Prop({ required: true, default: true })
  is_voucher_eligible: boolean;

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const ServiceTypeSchema = SchemaFactory.createForClass(ServiceType);

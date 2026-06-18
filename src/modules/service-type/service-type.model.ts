import { HydratedDocument, Schema, Types, model } from 'mongoose';

// Plain-Mongoose rewrite of
// features/service-type/entities/service-type.entity.ts (incl. the embedded
// VehiclePricing sub-document, _id: false).
export interface VehiclePricing {
  vehicle_type_id: Types.ObjectId;
  price: Types.Decimal128;
  estimated_minutes: number;
  is_active: boolean;
}

export interface ServiceType {
  name: string;
  description?: string;
  base_price: Types.Decimal128;
  estimated_minutes: number;
  points_multiplier: number;
  checklist_template: string[];
  is_voucher_eligible: boolean;
  vehicle_pricing: VehiclePricing[];
  is_active: boolean;
}

export type ServiceTypeDocument = HydratedDocument<ServiceType>;

const vehiclePricingSchema = new Schema<VehiclePricing>(
  {
    vehicle_type_id: {
      type: Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: true,
    },
    price: { type: Schema.Types.Decimal128, required: true },
    estimated_minutes: { type: Number, required: true, min: 1 },
    is_active: { type: Boolean, required: true, default: true },
  },
  { _id: false },
);

const serviceTypeSchema = new Schema<ServiceType>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    description: { type: String, trim: true },
    base_price: { type: Schema.Types.Decimal128, required: true },
    estimated_minutes: { type: Number, required: true, min: 1 },
    points_multiplier: { type: Number, required: true, min: 0 },
    checklist_template: { type: [String], default: [] },
    is_voucher_eligible: { type: Boolean, required: true, default: true },
    vehicle_pricing: { type: [vehiclePricingSchema], default: [] },
    is_active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'service_types',
  },
);

export const ServiceTypeModel = model<ServiceType>(
  'ServiceType',
  serviceTypeSchema,
);

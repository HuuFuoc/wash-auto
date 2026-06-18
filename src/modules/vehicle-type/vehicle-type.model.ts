import { HydratedDocument, Schema, model } from 'mongoose';

// Plain-Mongoose rewrite of features/vehicle-type/entities/vehicle-type.entity.ts
// (@Schema/@Prop). Field names, collection, indexes and timestamp mapping are
// kept identical so it binds to the exact same documents.
export interface VehicleType {
  name: string;
  description?: string;
  is_active: boolean;
}

export type VehicleTypeDocument = HydratedDocument<VehicleType>;

const vehicleTypeSchema = new Schema<VehicleType>(
  {
    name: { type: String, required: true, unique: true, trim: true, index: true },
    description: { type: String, trim: true },
    is_active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'vehicle_types',
  },
);

export const VehicleTypeModel = model<VehicleType>(
  'VehicleType',
  vehicleTypeSchema,
);

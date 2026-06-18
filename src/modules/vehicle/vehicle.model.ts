import { HydratedDocument, Schema, Types, model } from 'mongoose';

// Plain-Mongoose rewrite of features/vehicle/entities/vehicle.entity.ts.
// NOTE: the DB key is `car_model` (not `model`) because `model` collides with
// Mongoose Model<T> method names and breaks .create() inference.
export interface Vehicle {
  customer_id: Types.ObjectId;
  vehicle_type_id: Types.ObjectId;
  license_plate: string;
  nickname?: string;
  brand?: string;
  car_model?: string;
  color?: string;
  is_default: boolean;
  is_active: boolean;
}

export type VehicleDocument = HydratedDocument<Vehicle>;

const vehicleSchema = new Schema<Vehicle>(
  {
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    vehicle_type_id: {
      type: Schema.Types.ObjectId,
      ref: 'VehicleType',
      required: true,
      index: true,
    },
    license_plate: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    nickname: { type: String, trim: true },
    brand: { type: String, trim: true },
    car_model: { type: String, trim: true },
    color: { type: String, trim: true },
    is_default: { type: Boolean, default: false },
    is_active: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'vehicles',
  },
);

vehicleSchema.index({ customer_id: 1, is_active: 1 });

export const VehicleModel = model<Vehicle>('Vehicle', vehicleSchema);

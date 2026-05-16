import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type VehicleDocument = HydratedDocument<Vehicle>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'vehicles',
})
export class Vehicle {
  @Prop({
    type: Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  customer_id: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'VehicleType',
    required: true,
    index: true,
  })
  vehicle_type_id: Types.ObjectId;

  @Prop({ required: true, unique: true, trim: true, index: true })
  license_plate: string;

  @Prop({ trim: true })
  nickname?: string;

  @Prop({ trim: true })
  brand?: string;

  // NOTE: docs §3.4 names this field `model`, but `model` is also a method on
  // Mongoose Model<T>, which breaks .create() type inference. Stored in DB
  // under the same key `car_model` for consistency between TS and DB.
  @Prop({ trim: true })
  car_model?: string;

  @Prop({ trim: true })
  color?: string;

  @Prop({ default: false })
  is_default: boolean;

  @Prop({ default: true })
  is_active: boolean;
}

export const VehicleSchema = SchemaFactory.createForClass(Vehicle);
VehicleSchema.index({ customer_id: 1, is_active: 1 });

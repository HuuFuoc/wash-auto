import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type VehicleTypeDocument = HydratedDocument<VehicleType>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'vehicle_types',
})
export class VehicleType {
  @Prop({ required: true, unique: true, trim: true, index: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true, index: true })
  is_active: boolean;
}

export const VehicleTypeSchema = SchemaFactory.createForClass(VehicleType);

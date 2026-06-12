import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

/**
 * One (service, vehicle type) pair a washer is allowed to handle. Only
 * meaningful for users with role=washer. Auto-assign / manual assign match a
 * job's (service_type_id, vehicle_type_id) against this list before a washer
 * can take the car.
 */
export interface IWasherSkill {
  service_type_id: Types.ObjectId;
  vehicle_type_id: Types.ObjectId;
}

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'users',
})
export class User {
  @Prop({
    type: Types.ObjectId,
    ref: 'Role',
    required: true,
    index: true,
  })
  role_id: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, unique: true, trim: true, index: true })
  phone: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  })
  email: string;

  @Prop({ required: true })
  password_hash: string;

  @Prop()
  avatar_url?: string;

  @Prop()
  date_of_birth?: Date;

  @Prop({ default: true })
  is_active: boolean;

  @Prop()
  delete_requested_at?: Date;

  /**
   * Timestamp of the most recent successful email OTP verification.
   * Missing/null means the user has never verified. Within the
   * configured skip window (default 7 days) we re-issue a verified-email
   * token without sending a new OTP.
   */
  @Prop({ type: Date })
  email_verified_at?: Date;

  /**
   * Washer specialisation: the (service, vehicle type) pairs this washer may
   * service. Empty/undefined for non-washers and for washers with no skills
   * configured yet (such a washer is never auto-assigned any car).
   */
  @Prop({
    type: [
      {
        service_type_id: { type: Types.ObjectId, ref: 'ServiceType' },
        vehicle_type_id: { type: Types.ObjectId, ref: 'VehicleType' },
      },
    ],
    default: undefined,
  })
  washer_skills?: IWasherSkill[];
}

export const UserSchema = SchemaFactory.createForClass(User);
// Lookup washers able to handle a given (service, vehicle type) pair, used by
// skill-aware booking and the auto-assign engine.
UserSchema.index({
  'washer_skills.service_type_id': 1,
  'washer_skills.vehicle_type_id': 1,
});

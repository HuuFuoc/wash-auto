import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type UserDocument = HydratedDocument<User>;

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
}

export const UserSchema = SchemaFactory.createForClass(User);

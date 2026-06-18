import { HydratedDocument, Schema, Types, model } from 'mongoose';

// Plain-Mongoose rewrite of features/auth/entities/user.entity.ts.
export interface User {
  role_id: Types.ObjectId;
  name: string;
  phone: string;
  email: string;
  password_hash: string;
  avatar_url?: string;
  date_of_birth?: Date;
  is_active: boolean;
  delete_requested_at?: Date;
  /** Timestamp of the most recent successful email OTP verification. */
  email_verified_at?: Date;
}

export type UserDocument = HydratedDocument<User>;

const userSchema = new Schema<User>(
  {
    role_id: {
      type: Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
      index: true,
    },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, unique: true, trim: true, index: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password_hash: { type: String, required: true },
    avatar_url: { type: String },
    date_of_birth: { type: Date },
    is_active: { type: Boolean, default: true },
    delete_requested_at: { type: Date },
    email_verified_at: { type: Date },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'users',
  },
);

export const UserModel = model<User>('User', userSchema);

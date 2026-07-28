import { HydratedDocument, Schema, Types, model } from 'mongoose';

// Plain-Mongoose rewrite of features/auth/entities/user.entity.ts.
export interface User {
  role_id: Types.ObjectId;
  name: string;
  /**
   * Absent on accounts created through Google Sign-In — Google never gives us a
   * phone number. The SPA is expected to collect it (PATCH /me/profile) before
   * the first booking; nothing in auth needs it.
   */
  phone?: string;
  email: string;
  /**
   * Absent on Google-only accounts. `login()` treats a missing hash as "wrong
   * credentials"; POST /auth/forgot-password is the supported way to add one.
   */
  password_hash?: string;
  /** Google's `sub` claim — the stable account id. Survives an email change. */
  google_id?: string;
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
    // `sparse` is load-bearing, not decoration: a plain unique index stores a
    // missing field as null, so the SECOND phone-less (Google) account would
    // collide with the first on `phone: null`. Existing deployments must run
    // scripts/migrate-google-auth.ts once — Mongo cannot change an index's
    // options in place, so the old non-sparse `phone_1` has to be dropped and
    // rebuilt.
    phone: { type: String, unique: true, sparse: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password_hash: { type: String },
    google_id: { type: String, unique: true, sparse: true },
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

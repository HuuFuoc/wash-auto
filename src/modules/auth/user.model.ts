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
    // Uniqueness is declared below as a PARTIAL index, not here — see the note
    // on userSchema.index().
    phone: { type: String, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    password_hash: { type: String },
    google_id: { type: String },
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

/**
 * `phone` and `google_id` are unique only among the documents that actually
 * HAVE them — Google accounts carry neither a phone nor (for password accounts)
 * a google_id.
 *
 * A plain `unique: true` cannot express that: MongoDB indexes a missing field
 * as null, so exactly one phone-less account could ever exist and the next one
 * died with `E11000 dup key: { phone: null }`.
 *
 * `partialFilterExpression` rather than `sparse: true`, even though this code
 * only ever omits the key (never writes an explicit null, which is the one case
 * sparse would not cover). The two behave identically for the writes we make
 * today; partial keeps holding if some future path does set `phone: null`,
 * because it indexes a document only when the value is really a string.
 *
 * Mongoose CANNOT retrofit this onto a collection that already has the old
 * `phone_1` — an index's options are immutable, and the conflicting createIndex
 * fails into an 'index' event nobody listens to, so the app boots looking fine
 * while the old index keeps rejecting writes. Existing databases must run
 * scripts/migrate-google-auth.ts once.
 */
const uniqueWhenPresent = (field: 'phone' | 'google_id'): void => {
  userSchema.index(
    { [field]: 1 },
    { unique: true, partialFilterExpression: { [field]: { $type: 'string' } } },
  );
};
uniqueWhenPresent('phone');
uniqueWhenPresent('google_id');

export const UserModel = model<User>('User', userSchema);

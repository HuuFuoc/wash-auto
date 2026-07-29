import { Types } from 'mongoose';
import { UserDocument, UserModel } from './user.model';

type UserQuery = {
  role_id?: Types.ObjectId;
  is_active?: boolean;
  delete_requested_at?: { $exists: boolean };
  $or?: Array<{ name?: RegExp; email?: RegExp; phone?: RegExp }>;
};

export interface ICreateUserInput {
  roleId: Types.ObjectId;
  name: string;
  /** Omitted for Google sign-ups; see User.phone. */
  phone?: string;
  email: string;
  /** Omitted for Google sign-ups; see User.password_hash. */
  passwordHash?: string;
  googleId?: string;
  emailVerifiedAt?: Date;
  /**
   * Omit to get the schema default (`true`). Password sign-ups pass `false` and
   * stay switched off until the email OTP goes through — see AuthService.register.
   */
  isActive?: boolean;
  avatarUrl?: string;
  dateOfBirth?: Date;
}

export interface IUserListFilter {
  roleId?: Types.ObjectId;
  isActive?: boolean;
  search?: string;
  includeDeleted?: boolean;
}

export interface IUpdateUserInput {
  name?: string;
  phone?: string;
  avatarUrl?: string;
  dateOfBirth?: Date;
  roleId?: Types.ObjectId;
  isActive?: boolean;
  passwordHash?: string;
  deleteRequestedAt?: Date | null;
}

export class UserRepository {
  async findByEmail(email: string): Promise<UserDocument | null> {
    return UserModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: Types.ObjectId | string): Promise<UserDocument | null> {
    return UserModel.findById(id).exec();
  }

  /** Google's `sub` claim. Preferred over the email: it survives an email change. */
  async findByGoogleId(googleId: string): Promise<UserDocument | null> {
    return UserModel.findOne({ google_id: googleId }).exec();
  }

  /**
   * Attaches a Google identity to an account that already existed (signed up by
   * password, then came back through Google). The `google_id: { $exists: false }`
   * guard makes it a no-op — returns null — if a DIFFERENT Google account got
   * there first, so one Google login can never steal another's link.
   *
   * `avatar_url` is only filled when the account has none, so a user who
   * uploaded their own picture does not get it replaced by their Google one.
   *
   * `activate` carries the same meaning as in setEmailVerifiedAt: the caller has
   * established that this account is only switched off because it never ran its
   * OTP, and Google has now supplied that proof.
   */
  async linkGoogleAccount(
    id: Types.ObjectId | string,
    googleId: string,
    avatarUrl?: string,
    activate = false,
  ): Promise<UserDocument | null> {
    const set: Record<string, unknown> = {
      google_id: googleId,
      // Google only hands us a profile once it has verified the address, so the
      // account is verified by the same evidence an OTP would have produced.
      email_verified_at: new Date(),
    };
    if (activate) set.is_active = true;
    // `$ifNull` keeps the existing avatar when there is one; an update pipeline
    // is what lets that read-then-write happen inside the single atomic update.
    if (avatarUrl) {
      set.avatar_url = { $ifNull: ['$avatar_url', avatarUrl] };
    }
    return UserModel.findOneAndUpdate(
      { _id: id, google_id: { $exists: false } },
      [{ $set: set }],
      // `updatePipeline` is REQUIRED for the array form since Mongoose 9 — v8
      // inferred it from the array and v9 made it opt-in. Without it the driver
      // is never reached: Mongoose throws "Cannot pass an array to query updates
      // unless the `updatePipeline` option is set." before sending anything.
      { returnDocument: 'after', updatePipeline: true },
    ).exec();
  }

  /** Batch lookup by id - used to enrich list responses with user name/email. */
  async findByIds(
    ids: Array<Types.ObjectId | string>,
  ): Promise<UserDocument[]> {
    if (ids.length === 0) return [];
    return UserModel.find({ _id: { $in: ids } }).exec();
  }

  /**
   * Active (non-deleted) user ids for a given role - the assignable staff pool.
   * Used by auto-assign to enumerate washers without coupling to staff shifts.
   */
  async findActiveIdsByRoleId(
    roleId: Types.ObjectId,
  ): Promise<Types.ObjectId[]> {
    const ids = await UserModel.distinct('_id', {
      role_id: roleId,
      is_active: true,
      delete_requested_at: { $exists: false },
    }).exec();
    return ids as Types.ObjectId[];
  }

  async existsByEmail(email: string): Promise<boolean> {
    const found = await UserModel.exists({ email: email.toLowerCase() }).exec();
    return found !== null;
  }

  async existsByPhone(phone: string): Promise<boolean> {
    const found = await UserModel.exists({ phone }).exec();
    return found !== null;
  }

  async existsByEmailExcept(
    email: string,
    excludeId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await UserModel.exists({
      email: email.toLowerCase(),
      _id: { $ne: excludeId },
    }).exec();
    return found !== null;
  }

  async existsByPhoneExcept(
    phone: string,
    excludeId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await UserModel.exists({
      phone,
      _id: { $ne: excludeId },
    }).exec();
    return found !== null;
  }

  /** Returns user _ids whose phone contains the given substring (case-insensitive). */
  async findIdsByPhoneLike(phoneLike: string): Promise<Types.ObjectId[]> {
    const term = phoneLike.trim();
    if (term.length === 0) return [];
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await UserModel.find({
      phone: { $regex: escaped, $options: 'i' },
    })
      .select({ _id: 1 })
      .exec();
    return docs.map((d) => d._id);
  }

  /**
   * Stamps email_verified_at after a successful OTP verification.
   * `activate` additionally switches `is_active` on —
   * that is the moment a password sign-up becomes a usable account. It is an
   * explicit argument rather than something inferred here so that an account an
   * admin deactivated cannot re-enable itself just by running the OTP flow.
   */
  async setEmailVerifiedAt(
    id: Types.ObjectId | string,
    at: Date,
    activate = false,
  ): Promise<void> {
    const set: Record<string, unknown> = { email_verified_at: at };
    if (activate) set.is_active = true;
    await UserModel.updateOne({ _id: id }, { $set: set }).exec();
  }

  async createUser(input: ICreateUserInput): Promise<UserDocument> {
    // `undefined` values are dropped by Mongoose, so a phone-less Google account
    // is stored with the key ABSENT rather than null. The partial unique index
    // on `phone` skips it either way, but keeping the key out means the API
    // never emits `phone: null` as a third state next to "string" and "absent".
    return UserModel.create({
      role_id: input.roleId,
      name: input.name,
      phone: input.phone,
      email: input.email.toLowerCase(),
      password_hash: input.passwordHash,
      google_id: input.googleId,
      email_verified_at: input.emailVerifiedAt,
      // Same `undefined` rule as above: leaving it out lets the schema default
      // (`true`) stand, so only callers that mean "inactive" have to say so.
      is_active: input.isActive,
      avatar_url: input.avatarUrl,
      date_of_birth: input.dateOfBirth,
    });
  }

  async findPaginated(
    filter: IUserListFilter,
    page: number,
    limit: number,
  ): Promise<UserDocument[]> {
    const query = this.buildFilterQuery(filter);
    const skip = (page - 1) * limit;
    return UserModel.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countMatching(filter: IUserListFilter): Promise<number> {
    const query = this.buildFilterQuery(filter);
    return UserModel.countDocuments(query).exec();
  }

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateUserInput,
  ): Promise<UserDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.phone !== undefined) update.phone = input.phone;
    if (input.avatarUrl !== undefined) update.avatar_url = input.avatarUrl;
    if (input.dateOfBirth !== undefined)
      update.date_of_birth = input.dateOfBirth;
    if (input.roleId !== undefined) update.role_id = input.roleId;
    if (input.isActive !== undefined) update.is_active = input.isActive;
    if (input.passwordHash !== undefined)
      update.password_hash = input.passwordHash;
    if (input.deleteRequestedAt !== undefined)
      update.delete_requested_at = input.deleteRequestedAt;

    return UserModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  private buildFilterQuery(filter: IUserListFilter): UserQuery {
    const query: UserQuery = {};

    if (filter.roleId) {
      query.role_id = filter.roleId;
    }
    if (filter.isActive !== undefined) {
      query.is_active = filter.isActive;
    }
    if (!filter.includeDeleted) {
      query.delete_requested_at = { $exists: false };
    }
    if (filter.search) {
      const term = filter.search.trim();
      if (term.length > 0) {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'i');
        query.$or = [{ name: regex }, { email: regex }, { phone: regex }];
      }
    }

    return query;
  }
}

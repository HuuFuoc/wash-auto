import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { IWasherSkill, User, UserDocument } from '../entities/user.entity';

type UserQuery = {
  role_id?: Types.ObjectId;
  is_active?: boolean;
  delete_requested_at?: { $exists: boolean };
  $or?: Array<{ name?: RegExp; email?: RegExp; phone?: RegExp }>;
};

export interface ICreateUserInput {
  roleId: Types.ObjectId;
  name: string;
  phone: string;
  email: string;
  passwordHash: string;
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

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
  }

  async findById(id: Types.ObjectId | string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  /** Batch lookup by id - used to enrich list responses with user name/email. */
  async findByIds(
    ids: Array<Types.ObjectId | string>,
  ): Promise<UserDocument[]> {
    if (ids.length === 0) return [];
    return this.userModel.find({ _id: { $in: ids } }).exec();
  }

  async existsByEmail(email: string): Promise<boolean> {
    const found = await this.userModel
      .exists({ email: email.toLowerCase() })
      .exec();
    return found !== null;
  }

  async existsByPhone(phone: string): Promise<boolean> {
    const found = await this.userModel.exists({ phone }).exec();
    return found !== null;
  }

  async existsByEmailExcept(
    email: string,
    excludeId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await this.userModel
      .exists({ email: email.toLowerCase(), _id: { $ne: excludeId } })
      .exec();
    return found !== null;
  }

  async existsByPhoneExcept(
    phone: string,
    excludeId: Types.ObjectId | string,
  ): Promise<boolean> {
    const found = await this.userModel
      .exists({ phone, _id: { $ne: excludeId } })
      .exec();
    return found !== null;
  }

  /** Returns user _ids whose phone contains the given substring (case-insensitive). */
  async findIdsByPhoneLike(phoneLike: string): Promise<Types.ObjectId[]> {
    const term = phoneLike.trim();
    if (term.length === 0) return [];
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const docs = await this.userModel
      .find({ phone: { $regex: escaped, $options: 'i' } })
      .select({ _id: 1 })
      .exec();
    return docs.map((d) => d._id);
  }

  /**
   * Active washers whose skill list contains the exact (service, vehicle type)
   * pair. Skills are only ever set on washers, so an `$elemMatch` hit implies
   * role=washer. Used by skill-aware booking and the auto-assign engine.
   */
  async findWasherIdsWithSkill(
    serviceTypeId: Types.ObjectId | string,
    vehicleTypeId: Types.ObjectId | string,
  ): Promise<Types.ObjectId[]> {
    const docs = await this.userModel
      .find({
        is_active: true,
        delete_requested_at: { $exists: false },
        washer_skills: {
          $elemMatch: {
            service_type_id: new Types.ObjectId(serviceTypeId),
            vehicle_type_id: new Types.ObjectId(vehicleTypeId),
          },
        },
      })
      .select({ _id: 1 })
      .exec();
    return docs.map((d) => d._id);
  }

  /** Replaces a washer's full skill list (set-semantics, not append). */
  async setWasherSkills(
    id: Types.ObjectId | string,
    skills: IWasherSkill[],
  ): Promise<UserDocument | null> {
    return this.userModel
      .findByIdAndUpdate(
        id,
        { $set: { washer_skills: skills } },
        { returnDocument: 'after' },
      )
      .exec();
  }

  /** Stamps email_verified_at after a successful OTP verification. */
  async setEmailVerifiedAt(
    id: Types.ObjectId | string,
    at: Date,
  ): Promise<void> {
    await this.userModel
      .updateOne({ _id: id }, { $set: { email_verified_at: at } })
      .exec();
  }

  async createUser(input: ICreateUserInput): Promise<UserDocument> {
    return this.userModel.create({
      role_id: input.roleId,
      name: input.name,
      phone: input.phone,
      email: input.email.toLowerCase(),
      password_hash: input.passwordHash,
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
    return this.userModel
      .find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .exec();
  }

  async countMatching(filter: IUserListFilter): Promise<number> {
    const query = this.buildFilterQuery(filter);
    return this.userModel.countDocuments(query).exec();
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

    return this.userModel
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
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

import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../entities/user.entity';

export interface ICreateUserInput {
  roleId: Types.ObjectId;
  name: string;
  phone: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  dateOfBirth?: Date;
}

@Injectable()
export class UserRepository {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase() }).exec();
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
}

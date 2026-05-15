import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../entities/user.entity';
import { RoleEnum } from '../types/role.enum';

export interface ICreateUserInput {
  email: string;
  passwordHash: string;
  fullName: string;
  role?: RoleEnum;
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

  async createUser(input: ICreateUserInput): Promise<UserDocument> {
    return this.userModel.create({
      email: input.email.toLowerCase(),
      passwordHash: input.passwordHash,
      fullName: input.fullName,
      role: input.role ?? RoleEnum.CUSTOMER,
    });
  }
}

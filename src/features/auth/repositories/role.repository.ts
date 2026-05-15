import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Role, RoleDocument } from '../entities/role.entity';
import { RoleEnum } from '../types/role.enum';

export interface IUpsertRoleInput {
  code: RoleEnum;
  name: string;
  description?: string;
}

@Injectable()
export class RoleRepository {
  constructor(
    @InjectModel(Role.name) private readonly roleModel: Model<RoleDocument>,
  ) {}

  async findByCode(code: RoleEnum): Promise<RoleDocument | null> {
    return this.roleModel.findOne({ code }).exec();
  }

  async findById(id: Types.ObjectId | string): Promise<RoleDocument | null> {
    return this.roleModel.findById(id).exec();
  }

  async upsertByCode(input: IUpsertRoleInput): Promise<RoleDocument> {
    const doc = await this.roleModel
      .findOneAndUpdate(
        { code: input.code },
        {
          $setOnInsert: {
            code: input.code,
            name: input.name,
            description: input.description,
            is_active: true,
          },
        },
        { upsert: true, new: true },
      )
      .exec();
    if (!doc) {
      throw new Error(`Failed to upsert role: ${input.code}`);
    }
    return doc;
  }
}

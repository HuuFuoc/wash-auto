import { Types } from 'mongoose';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { RoleDocument, RoleModel } from './role.model';

export interface IUpsertRoleInput {
  code: RoleEnum;
  name: string;
  description?: string;
}

export class RoleRepository {
  async findByCode(code: RoleEnum): Promise<RoleDocument | null> {
    return RoleModel.findOne({ code }).exec();
  }

  async findById(id: Types.ObjectId | string): Promise<RoleDocument | null> {
    return RoleModel.findById(id).exec();
  }

  async upsertByCode(input: IUpsertRoleInput): Promise<RoleDocument> {
    const doc = await RoleModel.findOneAndUpdate(
      { code: input.code },
      {
        $setOnInsert: {
          code: input.code,
          name: input.name,
          description: input.description,
          is_active: true,
        },
      },
      { upsert: true, returnDocument: 'after' },
    ).exec();
    if (!doc) {
      throw new Error(`Failed to upsert role: ${input.code}`);
    }
    return doc;
  }
}

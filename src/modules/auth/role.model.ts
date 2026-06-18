import { HydratedDocument, Schema, model } from 'mongoose';
import { RoleEnum } from '../../shared/auth/types/role.enum';

// Plain-Mongoose rewrite of features/auth/entities/role.entity.ts.
export interface Role {
  code: RoleEnum;
  name: string;
  description?: string;
  is_active: boolean;
}

export type RoleDocument = HydratedDocument<Role>;

const roleSchema = new Schema<Role>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      enum: Object.values(RoleEnum),
      index: true,
    },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    is_active: { type: Boolean, default: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'roles',
  },
);

export const RoleModel = model<Role>('Role', roleSchema);

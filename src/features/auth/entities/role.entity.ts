import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { RoleEnum } from '../types/role.enum';

export type RoleDocument = HydratedDocument<Role>;

@Schema({
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  collection: 'roles',
})
export class Role {
  @Prop({
    type: String,
    required: true,
    unique: true,
    enum: Object.values(RoleEnum),
    index: true,
  })
  code: RoleEnum;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ default: true })
  is_active: boolean;
}

export const RoleSchema = SchemaFactory.createForClass(Role);

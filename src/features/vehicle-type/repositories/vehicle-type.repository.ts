import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  VehicleType,
  VehicleTypeDocument,
} from '../entities/vehicle-type.entity';

export interface ICreateVehicleTypeInput {
  name: string;
  description?: string;
}

export interface IUpdateVehicleTypeInput {
  name?: string;
  description?: string;
}

@Injectable()
export class VehicleTypeRepository {
  constructor(
    @InjectModel(VehicleType.name)
    private readonly model: Model<VehicleTypeDocument>,
  ) {}

  async findActive(): Promise<VehicleTypeDocument[]> {
    return this.model.find({ is_active: true }).sort({ name: 1 }).exec();
  }

  async findAll(): Promise<VehicleTypeDocument[]> {
    return this.model.find().sort({ name: 1 }).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<VehicleTypeDocument | null> {
    return this.model.findById(id).exec();
  }

  async existsByName(name: string): Promise<boolean> {
    const found = await this.model.exists({ name }).exec();
    return found !== null;
  }

  async create(input: ICreateVehicleTypeInput): Promise<VehicleTypeDocument> {
    return this.model.create({
      name: input.name,
      description: input.description,
    });
  }

  async update(
    id: Types.ObjectId | string,
    input: IUpdateVehicleTypeInput,
  ): Promise<VehicleTypeDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.description !== undefined) update.description = input.description;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  async setActive(
    id: Types.ObjectId | string,
    isActive: boolean,
  ): Promise<VehicleTypeDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { is_active: isActive } },
        { returnDocument: 'after' },
      )
      .exec();
  }
}

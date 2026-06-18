import { Types } from 'mongoose';
import { VehicleTypeDocument, VehicleTypeModel } from './vehicle-type.model';

export interface ICreateVehicleTypeInput {
  name: string;
  description?: string;
}

export interface IUpdateVehicleTypeInput {
  name?: string;
  description?: string;
}

export class VehicleTypeRepository {
  async findActive(): Promise<VehicleTypeDocument[]> {
    return VehicleTypeModel.find({ is_active: true }).sort({ name: 1 }).exec();
  }

  async findAll(): Promise<VehicleTypeDocument[]> {
    return VehicleTypeModel.find().sort({ name: 1 }).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<VehicleTypeDocument | null> {
    return VehicleTypeModel.findById(id).exec();
  }

  async existsByName(name: string): Promise<boolean> {
    const found = await VehicleTypeModel.exists({ name }).exec();
    return found !== null;
  }

  async create(input: ICreateVehicleTypeInput): Promise<VehicleTypeDocument> {
    return VehicleTypeModel.create({
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

    return VehicleTypeModel.findByIdAndUpdate(
      id,
      { $set: update },
      { returnDocument: 'after' },
    ).exec();
  }

  async setActive(
    id: Types.ObjectId | string,
    isActive: boolean,
  ): Promise<VehicleTypeDocument | null> {
    return VehicleTypeModel.findByIdAndUpdate(
      id,
      { $set: { is_active: isActive } },
      { returnDocument: 'after' },
    ).exec();
  }
}

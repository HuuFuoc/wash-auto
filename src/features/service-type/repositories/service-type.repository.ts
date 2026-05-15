import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ServiceType,
  ServiceTypeDocument,
} from '../entities/service-type.entity';

export interface ICreateServiceTypeInput {
  name: string;
  description?: string;
  basePrice: Types.Decimal128;
  estimatedMinutes: number;
  pointsMultiplier: number;
}

export interface IUpdateServiceTypeInput {
  name?: string;
  description?: string;
  basePrice?: Types.Decimal128;
  estimatedMinutes?: number;
  pointsMultiplier?: number;
}

@Injectable()
export class ServiceTypeRepository {
  constructor(
    @InjectModel(ServiceType.name)
    private readonly model: Model<ServiceTypeDocument>,
  ) {}

  async findActive(): Promise<ServiceTypeDocument[]> {
    return this.model.find({ is_active: true }).sort({ name: 1 }).exec();
  }

  async findAll(): Promise<ServiceTypeDocument[]> {
    return this.model.find().sort({ name: 1 }).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<ServiceTypeDocument | null> {
    return this.model.findById(id).exec();
  }

  async existsByName(name: string): Promise<boolean> {
    const found = await this.model.exists({ name }).exec();
    return found !== null;
  }

  async create(input: ICreateServiceTypeInput): Promise<ServiceTypeDocument> {
    return this.model.create({
      name: input.name,
      description: input.description,
      base_price: input.basePrice,
      estimated_minutes: input.estimatedMinutes,
      points_multiplier: input.pointsMultiplier,
    });
  }

  async update(
    id: Types.ObjectId | string,
    input: IUpdateServiceTypeInput,
  ): Promise<ServiceTypeDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.description !== undefined) update.description = input.description;
    if (input.basePrice !== undefined) update.base_price = input.basePrice;
    if (input.estimatedMinutes !== undefined)
      update.estimated_minutes = input.estimatedMinutes;
    if (input.pointsMultiplier !== undefined)
      update.points_multiplier = input.pointsMultiplier;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  async setActive(
    id: Types.ObjectId | string,
    isActive: boolean,
  ): Promise<ServiceTypeDocument | null> {
    return this.model
      .findByIdAndUpdate(
        id,
        { $set: { is_active: isActive } },
        { returnDocument: 'after' },
      )
      .exec();
  }
}

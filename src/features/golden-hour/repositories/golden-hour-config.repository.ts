import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  GoldenHourConfig,
  GoldenHourConfigDocument,
} from '../entities/golden-hour-config.entity';

export interface IUpsertGoldenHourInput {
  name: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  timezone: string;
}

export interface ICreateGoldenHourInput {
  name: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  timezone: string;
  isActive: boolean;
}

export interface IUpdateGoldenHourInput {
  name?: string;
  daysOfWeek?: number[];
  startMinute?: number;
  endMinute?: number;
  timezone?: string;
  isActive?: boolean;
}

@Injectable()
export class GoldenHourConfigRepository {
  constructor(
    @InjectModel(GoldenHourConfig.name)
    private readonly model: Model<GoldenHourConfigDocument>,
  ) {}

  async findActive(): Promise<GoldenHourConfigDocument[]> {
    return this.model.find({ is_active: true }).exec();
  }

  /** Every window (active and inactive), earliest start first. */
  async findAll(): Promise<GoldenHourConfigDocument[]> {
    return this.model.find({}).sort({ start_minute: 1 }).exec();
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<GoldenHourConfigDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return this.model.findById(id).exec();
  }

  async findByName(name: string): Promise<GoldenHourConfigDocument | null> {
    return this.model.findOne({ name }).exec();
  }

  /** True when another window (≠ excludeId) already uses `name`. */
  async existsByNameExcept(
    name: string,
    excludeId?: Types.ObjectId | string,
  ): Promise<boolean> {
    const query: Record<string, unknown> = { name };
    if (excludeId) query._id = { $ne: excludeId };
    const found = await this.model.exists(query).exec();
    return found !== null;
  }

  async create(
    input: ICreateGoldenHourInput,
  ): Promise<GoldenHourConfigDocument> {
    return this.model.create({
      name: input.name,
      days_of_week: input.daysOfWeek,
      start_minute: input.startMinute,
      end_minute: input.endMinute,
      timezone: input.timezone,
      is_active: input.isActive,
    });
  }

  async updateById(
    id: Types.ObjectId | string,
    input: IUpdateGoldenHourInput,
  ): Promise<GoldenHourConfigDocument | null> {
    const update: Record<string, unknown> = {};
    if (input.name !== undefined) update.name = input.name;
    if (input.daysOfWeek !== undefined) update.days_of_week = input.daysOfWeek;
    if (input.startMinute !== undefined)
      update.start_minute = input.startMinute;
    if (input.endMinute !== undefined) update.end_minute = input.endMinute;
    if (input.timezone !== undefined) update.timezone = input.timezone;
    if (input.isActive !== undefined) update.is_active = input.isActive;

    return this.model
      .findByIdAndUpdate(id, { $set: update }, { returnDocument: 'after' })
      .exec();
  }

  /** Deletes a window. Returns true when a document was removed. */
  async deleteById(id: Types.ObjectId | string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const res = await this.model.findByIdAndDelete(id).exec();
    return res !== null;
  }

  async upsertByName(
    input: IUpsertGoldenHourInput,
  ): Promise<GoldenHourConfigDocument> {
    const doc = await this.model
      .findOneAndUpdate(
        { name: input.name },
        {
          $setOnInsert: {
            name: input.name,
            days_of_week: input.daysOfWeek,
            start_minute: input.startMinute,
            end_minute: input.endMinute,
            timezone: input.timezone,
            is_active: true,
          },
        },
        { upsert: true, returnDocument: 'after' },
      )
      .exec();
    if (!doc) {
      throw new Error(`Failed to upsert golden_hour_config: ${input.name}`);
    }
    return doc;
  }
}

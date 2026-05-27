import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
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

@Injectable()
export class GoldenHourConfigRepository {
  constructor(
    @InjectModel(GoldenHourConfig.name)
    private readonly model: Model<GoldenHourConfigDocument>,
  ) {}

  async findActive(): Promise<GoldenHourConfigDocument[]> {
    return this.model.find({ is_active: true }).exec();
  }

  async findByName(name: string): Promise<GoldenHourConfigDocument | null> {
    return this.model.findOne({ name }).exec();
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

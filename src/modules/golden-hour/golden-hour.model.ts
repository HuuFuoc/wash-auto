import { HydratedDocument, Schema, model } from 'mongoose';

// Plain-Mongoose rewrite of
// features/golden-hour/entities/golden-hour-config.entity.ts.
export interface GoldenHourConfig {
  name: string;
  days_of_week: number[];
  start_minute: number;
  end_minute: number;
  timezone: string;
  discount_percent: number;
  is_active: boolean;
}

export type GoldenHourConfigDocument = HydratedDocument<GoldenHourConfig>;

const goldenHourConfigSchema = new Schema<GoldenHourConfig>(
  {
    name: { type: String, required: true, trim: true },
    // 0=Sunday … 6=Saturday. Empty array means "every day".
    days_of_week: { type: [Number], default: [], min: 0, max: 6 },
    start_minute: { type: Number, required: true, min: 0, max: 1439 },
    end_minute: { type: Number, required: true, min: 1, max: 1440 },
    timezone: { type: String, required: true, default: 'Asia/Ho_Chi_Minh' },
    discount_percent: { type: Number, required: true, default: 0, min: 0, max: 100 },
    is_active: { type: Boolean, default: true, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'golden_hour_configs',
  },
);

export const GoldenHourConfigModel = model<GoldenHourConfig>(
  'GoldenHourConfig',
  goldenHourConfigSchema,
);

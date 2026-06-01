import { Injectable, Logger } from '@nestjs/common';
import { GoldenHourConfigDocument } from './entities/golden-hour-config.entity';
import { GoldenHourConfigRepository } from './repositories/golden-hour-config.repository';

interface IDefaultGoldenHour {
  name: string;
  daysOfWeek: number[];
  startMinute: number;
  endMinute: number;
  timezone: string;
}

// Default windows aligned with the wash shop's quiet hours. Admins can edit
// these later via a future admin endpoint; for now the seed is the source of
// truth on first boot only.
const DEFAULT_GOLDEN_HOURS: IDefaultGoldenHour[] = [
  {
    name: 'Morning quiet hours',
    daysOfWeek: [],
    startMinute: 8 * 60,
    endMinute: 10 * 60,
    timezone: 'Asia/Ho_Chi_Minh',
  },
  {
    name: 'Early afternoon quiet hours',
    daysOfWeek: [],
    startMinute: 13 * 60,
    endMinute: 15 * 60,
    timezone: 'Asia/Ho_Chi_Minh',
  },
];

@Injectable()
export class GoldenHourService {
  private readonly logger = new Logger(GoldenHourService.name);

  constructor(private readonly repository: GoldenHourConfigRepository) {}

  async seedDefaults(): Promise<void> {
    for (const gh of DEFAULT_GOLDEN_HOURS) {
      await this.repository.upsertByName(gh);
    }
    this.logger.log(
      `Seeded ${DEFAULT_GOLDEN_HOURS.length} golden_hour_configs`,
    );
  }

  /**
   * Returns the first active golden-hour window covering `instant`, or null
   * if none. Match is computed in each window's configured IANA timezone so
   * a window expressed in Asia/Ho_Chi_Minh holds whether the booking value
   * is supplied as UTC or local.
   */
  async findActiveAt(instant: Date): Promise<GoldenHourConfigDocument | null> {
    const windows = await this.repository.findActive();
    for (const window of windows) {
      if (this.instantInWindow(instant, window)) return window;
    }
    return null;
  }

  private instantInWindow(
    instant: Date,
    window: GoldenHourConfigDocument,
  ): boolean {
    const parts = this.extractZonedParts(instant, window.timezone);
    if (
      window.days_of_week.length > 0 &&
      !window.days_of_week.includes(parts.dayOfWeek)
    ) {
      return false;
    }
    const minutes = parts.hour * 60 + parts.minute;
    return minutes >= window.start_minute && minutes < window.end_minute;
  }

  private extractZonedParts(
    instant: Date,
    timezone: string,
  ): { dayOfWeek: number; hour: number; minute: number } {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(instant);
    const map: Record<string, string> = {};
    for (const part of parts) {
      if (part.type !== 'literal') map[part.type] = part.value;
    }
    const weekdayMap: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    const dayOfWeek = weekdayMap[map.weekday] ?? 0;
    let hour = parseInt(map.hour ?? '0', 10);
    // `hour12: false` can yield "24" at midnight in some runtimes - normalize.
    if (hour === 24) hour = 0;
    const minute = parseInt(map.minute ?? '0', 10);
    return { dayOfWeek, hour, minute };
  }
}

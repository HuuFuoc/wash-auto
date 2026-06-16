import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { CreateGoldenHourDto } from './dto/create-golden-hour.dto';
import { GoldenHourResponseDto } from './dto/golden-hour-response.dto';
import { UpdateGoldenHourDto } from './dto/update-golden-hour.dto';
import { GoldenHourConfigDocument } from './entities/golden-hour-config.entity';
import { GoldenHourConfigRepository } from './repositories/golden-hour-config.repository';

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';

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

  // ---------- admin CRUD ----------

  /** Every window (active + inactive), earliest start first. */
  async list(): Promise<GoldenHourResponseDto[]> {
    const docs = await this.repository.findAll();
    return docs.map((d) => GoldenHourResponseDto.fromDocument(d));
  }

  async create(dto: CreateGoldenHourDto): Promise<GoldenHourResponseDto> {
    const timezone = dto.timezone ?? DEFAULT_TIMEZONE;
    this.assertWindowValid(dto.startMinute, dto.endMinute, timezone);
    if (await this.repository.existsByNameExcept(dto.name)) {
      throw new ConflictException(
        `A golden hour named "${dto.name}" already exists`,
      );
    }
    const created = await this.repository.create({
      name: dto.name,
      daysOfWeek: dto.daysOfWeek ?? [],
      startMinute: dto.startMinute,
      endMinute: dto.endMinute,
      timezone,
      discountPercent: dto.discountPercent ?? 0,
      isActive: true,
    });
    this.logger.log('Created golden hour', {
      id: created._id.toString(),
      name: created.name,
    });
    return GoldenHourResponseDto.fromDocument(created);
  }

  async update(
    id: string,
    dto: UpdateGoldenHourDto,
  ): Promise<GoldenHourResponseDto> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Golden hour not found');

    // Validate the window as it would look AFTER the patch (merge with current).
    const startMinute = dto.startMinute ?? existing.start_minute;
    const endMinute = dto.endMinute ?? existing.end_minute;
    const timezone = dto.timezone ?? existing.timezone;
    this.assertWindowValid(startMinute, endMinute, timezone);

    if (
      dto.name !== undefined &&
      (await this.repository.existsByNameExcept(dto.name, id))
    ) {
      throw new ConflictException(
        `A golden hour named "${dto.name}" already exists`,
      );
    }

    const updated = await this.repository.updateById(id, {
      name: dto.name,
      daysOfWeek: dto.daysOfWeek,
      startMinute: dto.startMinute,
      endMinute: dto.endMinute,
      timezone: dto.timezone,
      discountPercent: dto.discountPercent,
      isActive: dto.isActive,
    });
    if (!updated) throw new NotFoundException('Golden hour not found');
    this.logger.log('Updated golden hour', { id });
    return GoldenHourResponseDto.fromDocument(updated);
  }

  async remove(id: string): Promise<void> {
    const deleted = await this.repository.deleteById(id);
    if (!deleted) throw new NotFoundException('Golden hour not found');
    this.logger.log('Deleted golden hour', { id });
  }

  /** Window invariants shared by create + update. */
  private assertWindowValid(
    startMinute: number,
    endMinute: number,
    timezone: string,
  ): void {
    if (endMinute <= startMinute) {
      throw new BadRequestException(
        'endMinute must be greater than startMinute',
      );
    }
    if (!this.isValidTimezone(timezone)) {
      throw new BadRequestException(`Invalid IANA timezone: ${timezone}`);
    }
  }

  private isValidTimezone(timezone: string): boolean {
    try {
      // Throws RangeError for an unknown IANA zone; .format() forces the probe.
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
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

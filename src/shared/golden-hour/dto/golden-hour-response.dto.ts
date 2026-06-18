import { ApiProperty } from '../../../common/swagger-shim';
import { GoldenHourConfigDocument } from '../../../modules/golden-hour/golden-hour.model';

/** Formats minutes-since-midnight as a "HH:mm" clock string (1440 → "24:00"). */
function toClock(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export class GoldenHourResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: 'Morning quiet hours' })
  name: string;

  @ApiProperty({
    example: [1, 2, 3, 4, 5],
    description: '0=Sun … 6=Sat. Empty array = every day.',
  })
  daysOfWeek: number[];

  @ApiProperty({
    example: 480,
    description: 'Local start, minutes since midnight.',
  })
  startMinute: number;

  @ApiProperty({
    example: 600,
    description: 'Local end (exclusive), minutes since midnight.',
  })
  endMinute: number;

  @ApiProperty({ example: '08:00', description: 'startMinute as HH:mm.' })
  startTime: string;

  @ApiProperty({ example: '10:00', description: 'endMinute as HH:mm.' })
  endTime: string;

  @ApiProperty({ example: 'Asia/Ho_Chi_Minh' })
  timezone: string;

  @ApiProperty({
    example: 10,
    description:
      'Discount percent this window grants, stacked on the tier discount ' +
      '(total capped at 50% before vouchers).',
  })
  discountPercent: number;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(doc: GoldenHourConfigDocument): GoldenHourResponseDto {
    const dto = new GoldenHourResponseDto();
    dto.id = doc._id.toString();
    dto.name = doc.name;
    dto.daysOfWeek = doc.days_of_week;
    dto.startMinute = doc.start_minute;
    dto.endMinute = doc.end_minute;
    dto.startTime = toClock(doc.start_minute);
    dto.endTime = toClock(doc.end_minute);
    dto.timezone = doc.timezone;
    dto.discountPercent = doc.discount_percent ?? 0;
    dto.isActive = doc.is_active;
    return dto;
  }
}

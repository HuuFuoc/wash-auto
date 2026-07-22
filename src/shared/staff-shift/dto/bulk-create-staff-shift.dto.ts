import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ShiftScheduleEnum } from '../types/shift-schedule.enum';

/**
 * Create shifts for every VN calendar day in [fromDate, toDate] (inclusive) in a
 * single request. `block` applies to every selected day; days that already have
 * an overlapping shift or whose window already ended are skipped, not rejected.
 */
export class BulkCreateStaffShiftDto {
  @ApiProperty({
    example: '2026-06-01',
    description: 'First day of the range (VN local, YYYY-MM-DD, inclusive).',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fromDate must be YYYY-MM-DD' })
  fromDate: string;

  @ApiProperty({
    example: '2026-06-30',
    description:
      'Last day of the range (VN local, YYYY-MM-DD, inclusive). Must be ≥ ' +
      'fromDate; the range may span at most 92 days.',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'toDate must be YYYY-MM-DD' })
  toDate: string;

  @ApiProperty({
    enum: ShiftScheduleEnum,
    example: ShiftScheduleEnum.FULLDAY,
    description:
      'Shift selection applied to every selected day. morning = 08:00–12:00, ' +
      'afternoon = 14:00–17:00, fullday = both (two shifts per day).',
  })
  @IsEnum(ShiftScheduleEnum)
  block: ShiftScheduleEnum;

  @ApiPropertyOptional({
    type: [Number],
    example: [1, 2, 3, 4, 5, 6],
    description:
      'ISO weekdays to include (Monday = 1 … Sunday = 7). Omit to include ' +
      'every day of the week.',
  })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(7, { each: true })
  weekdays?: number[];

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    minimum: 1,
    maximum: 10,
    description: 'Concurrent washes bookable in each created shift. Default 1.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  capacity?: number;

  @ApiPropertyOptional({ example: 'June rota' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

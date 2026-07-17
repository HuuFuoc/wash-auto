import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import {
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

export class CreateStaffShiftDto {
  @ApiProperty({
    example: '2026-06-01',
    description: 'Shift date in Vietnam local time (YYYY-MM-DD).',
  })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date: string;

  @ApiProperty({
    enum: ShiftScheduleEnum,
    example: ShiftScheduleEnum.MORNING,
    description:
      'Shift selection. morning = 08:00–12:00, afternoon = 14:00–17:00, ' +
      'fullday = both (creates two separate shifts). The server derives ' +
      'start/end from date + block.',
  })
  @IsEnum(ShiftScheduleEnum)
  block: ShiftScheduleEnum;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    minimum: 1,
    maximum: 10,
    description: 'Concurrent washes bookable in this shift. Default 1.',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10)
  capacity?: number;

  @ApiPropertyOptional({ example: 'Morning shift' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

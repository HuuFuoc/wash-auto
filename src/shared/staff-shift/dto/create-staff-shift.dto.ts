import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ShiftScheduleEnum } from '../types/shift-schedule.enum';
import { ShiftTypeEnum } from '../types/shift-type.enum';

export class CreateStaffShiftDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  staffId: string;

  @ApiProperty({ enum: ShiftTypeEnum, example: ShiftTypeEnum.WASHER })
  @IsEnum(ShiftTypeEnum)
  shiftType: ShiftTypeEnum;

  @ApiPropertyOptional({ example: 'Bay 1' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stationName?: string;

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

  @ApiPropertyOptional({ example: 'Morning shift' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

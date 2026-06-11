import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ShiftBlockEnum } from '../types/shift-block.enum';
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
    enum: ShiftBlockEnum,
    example: ShiftBlockEnum.MORNING,
    description:
      'Fixed working block. Morning = 08:00–12:00, Afternoon = 14:00–17:00 ' +
      '(VN). The server derives start/end from date + block.',
  })
  @IsEnum(ShiftBlockEnum)
  block: ShiftBlockEnum;

  @ApiPropertyOptional({ example: 'Morning shift' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

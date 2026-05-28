import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
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

  @ApiProperty({ example: '2026-06-01T08:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  startAt: Date;

  @ApiProperty({ example: '2026-06-01T12:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  endAt: Date;

  @ApiPropertyOptional({ example: 'Morning shift' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

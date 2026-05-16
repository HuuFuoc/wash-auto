import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ShiftTypeEnum } from '../types/shift-type.enum';

export class UpdateStaffShiftDto {
  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsOptional()
  @IsMongoId()
  staffId?: string;

  @ApiPropertyOptional({ enum: ShiftTypeEnum })
  @IsOptional()
  @IsEnum(ShiftTypeEnum)
  shiftType?: ShiftTypeEnum;

  @ApiPropertyOptional({ example: 'Bay 1' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  stationName?: string;

  @ApiPropertyOptional({ example: '2026-06-01T08:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startAt?: Date;

  @ApiPropertyOptional({ example: '2026-06-01T12:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  endAt?: Date;

  @ApiPropertyOptional({ example: 10, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxBookings?: number;

  @ApiPropertyOptional({ example: 'Morning shift' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { ShiftStatusEnum } from '../types/shift-status.enum';
import { ShiftTypeEnum } from '../types/shift-type.enum';

export class QueryStaffShiftDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsOptional()
  @IsMongoId()
  staffId?: string;

  @ApiPropertyOptional({ enum: ShiftTypeEnum })
  @IsOptional()
  @IsEnum(ShiftTypeEnum)
  shiftType?: ShiftTypeEnum;

  @ApiPropertyOptional({ enum: ShiftStatusEnum })
  @IsOptional()
  @IsEnum(ShiftStatusEnum)
  status?: ShiftStatusEnum;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startFrom?: Date;

  @ApiPropertyOptional({ example: '2026-06-30T23:59:59.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  startTo?: Date;
}

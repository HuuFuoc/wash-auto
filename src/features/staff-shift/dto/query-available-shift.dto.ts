import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsOptional } from 'class-validator';
import { ShiftTypeEnum } from '../types/shift-type.enum';

export class QueryAvailableShiftDto {
  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  from: Date;

  @ApiProperty({ example: '2026-06-07T23:59:59.000Z' })
  @Type(() => Date)
  @IsDate()
  to: Date;

  @ApiPropertyOptional({ enum: ShiftTypeEnum })
  @IsOptional()
  @IsEnum(ShiftTypeEnum)
  shiftType?: ShiftTypeEnum;
}

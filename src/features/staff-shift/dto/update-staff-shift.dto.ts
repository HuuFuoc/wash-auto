import { ApiPropertyOptional } from '@nestjs/swagger';
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

  @ApiPropertyOptional({
    example: '2026-06-01',
    description: 'New shift date (YYYY-MM-DD). Provide together with `block`.',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date must be YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({
    enum: ShiftBlockEnum,
    description: 'New working block. Provide together with `date`.',
  })
  @IsOptional()
  @IsEnum(ShiftBlockEnum)
  block?: ShiftBlockEnum;

  @ApiPropertyOptional({ example: 'Morning shift' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

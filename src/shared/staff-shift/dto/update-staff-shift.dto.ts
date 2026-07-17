import { ApiPropertyOptional } from '../../../common/swagger-shim';
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
import { ShiftBlockEnum } from '../types/shift-block.enum';

export class UpdateStaffShiftDto {
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

  @ApiPropertyOptional({
    example: 2,
    minimum: 1,
    maximum: 10,
    description: 'Concurrent washes bookable in this shift.',
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

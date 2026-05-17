import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { BookingStatusEnum } from '../types/booking-status.enum';

export class QueryBookingDto {
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
  customerId?: string;

  @ApiPropertyOptional({ enum: BookingStatusEnum })
  @IsOptional()
  @IsEnum(BookingStatusEnum)
  status?: BookingStatusEnum;

  @ApiPropertyOptional({ example: '2026-06-01T00:00:00.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledFrom?: Date;

  @ApiPropertyOptional({ example: '2026-06-30T23:59:59.000Z' })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduledTo?: Date;

  @ApiPropertyOptional({
    example: '0901',
    description:
      'Partial customer phone (case-insensitive substring) — cashier search per docs §5.3',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  customerPhone?: string;

  @ApiPropertyOptional({
    example: '51A',
    description:
      'Partial vehicle license_plate (case-insensitive substring) — cashier search per docs §5.3',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  vehicleLicensePlate?: string;
}

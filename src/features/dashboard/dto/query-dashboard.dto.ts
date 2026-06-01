import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { DashboardPeriodEnum } from '../types/dashboard-period.enum';

/**
 * Filters for the Management Reporting / Operational Analytics dashboard.
 *
 * `fromDate`/`toDate` are accepted as `YYYY-MM-DD` (or full ISO) date strings.
 * The service resolves them to Vietnam (UTC+7) day boundaries -
 * fromDate → 00:00:00.000, toDate → 23:59:59.999 - so a wash recorded near
 * midnight never leaks into the neighbouring day. When omitted the service
 * falls back to an all-time window. `period` is an echo/label hint only.
 */
export class QueryDashboardDto {
  @ApiPropertyOptional({ example: '2026-06-01', description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  fromDate?: string;

  @ApiPropertyOptional({ example: '2026-06-30', description: 'YYYY-MM-DD' })
  @IsOptional()
  @IsDateString()
  toDate?: string;

  @ApiPropertyOptional({ enum: DashboardPeriodEnum, example: 'month' })
  @IsOptional()
  @IsEnum(DashboardPeriodEnum)
  period?: DashboardPeriodEnum;

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Limit service-scoped reports to a single service type.',
  })
  @IsOptional()
  @IsMongoId()
  serviceId?: string;

  @ApiPropertyOptional({
    description: 'How many rows each Top-N ranking returns.',
    default: 5,
    minimum: 1,
    maximum: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  topN?: number = 5;
}

import { ApiPropertyOptional } from '../../../common/swagger-shim';
import { Type } from 'class-transformer';
import { IsDate, IsOptional } from 'class-validator';

/** Date window for the per-washer shift/performance stats. */
export class QueryStaffPerformanceDto {
  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00.000Z',
    description: 'Window start (inclusive). Omit for all-time.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date;

  @ApiPropertyOptional({
    example: '2026-06-30T23:59:59.999Z',
    description: 'Window end (inclusive). Omit for all-time.',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date;
}

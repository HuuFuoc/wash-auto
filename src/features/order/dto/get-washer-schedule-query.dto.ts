import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, Matches } from 'class-validator';
import { OrderStatusEnum } from '../types/order-status.enum';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ONLY_MSG = 'must be a calendar date in YYYY-MM-DD format';

/**
 * Query for a washer's own schedule (GET /washers/me/schedule). Every field is
 * optional. Date precedence (resolved in the service): a `from`/`to` range
 * overrides a single `date`; with none supplied the schedule runs from the
 * start of today onwards. The washer id is never accepted here - it is taken
 * from the access token so one washer cannot read another's schedule.
 */
export class GetWasherScheduleQueryDto {
  @ApiPropertyOptional({
    example: '2026-06-16',
    description:
      'Filter to a single calendar day (YYYY-MM-DD). Ignored when `from`/`to` is supplied.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: `date ${DATE_ONLY_MSG}` })
  date?: string;

  @ApiPropertyOptional({
    example: '2026-06-16',
    description:
      'Inclusive start of a date range (YYYY-MM-DD). Takes precedence over `date`.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: `from ${DATE_ONLY_MSG}` })
  from?: string;

  @ApiPropertyOptional({
    example: '2026-06-30',
    description:
      'Inclusive end of a date range (YYYY-MM-DD). Takes precedence over `date`.',
  })
  @IsOptional()
  @Matches(DATE_ONLY, { message: `to ${DATE_ONLY_MSG}` })
  to?: string;

  @ApiPropertyOptional({ enum: OrderStatusEnum })
  @IsOptional()
  @IsEnum(OrderStatusEnum)
  status?: OrderStatusEnum;
}

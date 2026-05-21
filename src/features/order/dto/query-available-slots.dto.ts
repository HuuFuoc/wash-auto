import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsMongoId } from 'class-validator';

/**
 * Query for `GET /me/orders/available-slots`. The customer picks a service
 * and a date range; the server returns the discrete, bookable start times.
 * `from`/`to` are absolute UTC instants so the timezone never matters — the
 * FE computes the day boundaries it wants to show.
 */
export class QueryAvailableSlotsDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  serviceTypeId: string;

  @ApiProperty({ example: '2026-06-01T00:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  from: Date;

  @ApiProperty({ example: '2026-06-01T23:59:59.000Z' })
  @Type(() => Date)
  @IsDate()
  to: Date;
}

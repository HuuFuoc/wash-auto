import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { Type } from 'class-transformer';
import { IsDate, IsMongoId, IsOptional } from 'class-validator';

export class RescheduleOrderDto {
  /**
   * Optional. Shifts are anonymous and capacity-based, so a customer picks a
   * time and the server picks the shift — same as booking. Kept for ops
   * tooling that already knows which shift it wants.
   */
  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsOptional()
  @IsMongoId()
  staffShiftId?: string;

  @ApiProperty({ example: '2026-06-02T10:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;
}

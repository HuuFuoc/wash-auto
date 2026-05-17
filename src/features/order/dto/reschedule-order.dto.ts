import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsDate, IsMongoId } from 'class-validator';

export class RescheduleOrderDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  staffShiftId: string;

  @ApiProperty({ example: '2026-06-02T10:00:00.000Z' })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;
}

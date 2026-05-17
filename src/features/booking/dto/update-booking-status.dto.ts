import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { BookingStatusEnum } from '../types/booking-status.enum';

export class UpdateBookingStatusDto {
  @ApiProperty({
    enum: BookingStatusEnum,
    example: BookingStatusEnum.CONFIRMED,
    description:
      'Allowed: pending→confirmed/cancelled/no_show, confirmed→in_progress/cancelled/no_show, in_progress→done.',
  })
  @IsEnum(BookingStatusEnum)
  status: BookingStatusEnum;

  @ApiPropertyOptional({
    example: 'Customer no longer interested',
    description: 'Required if transitioning to cancelled or no_show',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

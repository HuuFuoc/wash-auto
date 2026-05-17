import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatusEnum } from '../types/order-status.enum';

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: OrderStatusEnum,
    example: OrderStatusEnum.CHECKED_IN,
    description:
      'Allowed: pending_payment→confirmed/cancelled, confirmed→checked_in/cancelled/no_show, checked_in→in_progress/cancelled/no_show, in_progress→completed.',
  })
  @IsEnum(OrderStatusEnum)
  status: OrderStatusEnum;

  @ApiPropertyOptional({
    example: 'Customer no longer interested',
    description: 'Required when transitioning to cancelled or no_show.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

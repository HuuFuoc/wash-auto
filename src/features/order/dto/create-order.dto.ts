import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PaymentMethodEnum } from '../types/payment-method.enum';

export class CreateOrderDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  vehicleId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  serviceTypeId: string;

  @ApiProperty({
    example: '2026-05-18T01:30:00.000Z',
    description:
      'UTC timestamp. The server auto-picks an available shift that contains this time and has room for the service duration.',
  })
  @Type(() => Date)
  @IsDate()
  scheduledAt: Date;

  @ApiProperty({
    enum: PaymentMethodEnum,
    example: PaymentMethodEnum.ONLINE,
    description:
      'online → returns PayOS checkoutUrl, status=pending_payment until webhook. cash → status=confirmed immediately, payment_status=unpaid.',
  })
  @IsEnum(PaymentMethodEnum)
  paymentMethod: PaymentMethodEnum;

  @ApiPropertyOptional({
    example: 'Hut bui ky phan ghe sau, xe bam long cho.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

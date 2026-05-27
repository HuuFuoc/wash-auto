import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsMongoId,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CreateVehicleDto } from '../../vehicle/dto/create-vehicle.dto';
import { PaymentMethodEnum } from '../types/payment-method.enum';

export class CreateOrderDto {
  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description:
      'Id of a vehicle already saved in the customer garage. ' +
      'Provide this OR `vehicle` — exactly one, never both.',
  })
  @IsOptional()
  @IsMongoId()
  vehicleId?: string;

  @ApiPropertyOptional({
    type: CreateVehicleDto,
    description:
      'Details of a new vehicle to register on the fly. The server creates ' +
      'and saves it to the customer garage, then books it — one call. ' +
      'Provide this OR `vehicleId` — exactly one, never both.',
  })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => CreateVehicleDto)
  vehicle?: CreateVehicleDto;

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

  @ApiPropertyOptional({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description:
      'Id of a FREE_WASH voucher to redeem on this order. When provided and ' +
      'the voucher is valid, the order amount drops to 0 (cash-only).',
  })
  @IsOptional()
  @IsMongoId()
  voucherId?: string;
}

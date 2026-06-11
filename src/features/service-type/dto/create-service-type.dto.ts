import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** One row of a service's price board: price + duration for one vehicle type. */
export class VehiclePricingDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  vehicleTypeId: string;

  @ApiProperty({ example: 60000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes: number;

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'Whether this service is bookable for this vehicle type. false (or a ' +
      'missing row) means the combo does not apply.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateServiceTypeDto {
  @ApiProperty({ example: 'Premium Wash' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'Exterior + interior + tire shine' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @ApiProperty({ example: 80000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  basePrice: number;

  @ApiProperty({ example: 30 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  estimatedMinutes: number;

  @ApiProperty({ example: 1.5 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  pointsMultiplier: number;

  @ApiPropertyOptional({
    type: [String],
    example: ['Rửa thân xe', 'Hút bụi nội thất', 'Lau khô', 'Đánh bóng lốp'],
    description:
      'Wash steps a washer ticks off. Copied into each work order checklist at check-in.',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  checklistTemplate?: string[];

  @ApiPropertyOptional({
    example: true,
    default: true,
    description:
      'Whether FREE_WASH vouchers may be redeemed on this service. Set ' +
      'false for premium-priced services (Detailing) where a 100k voucher ' +
      'cap + Gold golden-hour discount would push margin below 5%.',
  })
  @IsOptional()
  @IsBoolean()
  isVoucherEligible?: boolean;

  @ApiPropertyOptional({
    type: [VehiclePricingDto],
    description:
      'Per-vehicle-type price + duration. Each vehicle type may appear at ' +
      'most once. A row with isActive=false (or no row) means the service ' +
      'does not apply to that vehicle type.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => VehiclePricingDto)
  vehiclePricing?: VehiclePricingDto[];
}

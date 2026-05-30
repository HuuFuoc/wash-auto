import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

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
}

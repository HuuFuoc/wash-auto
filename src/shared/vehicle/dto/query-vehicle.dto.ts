import { ApiPropertyOptional } from '../../../common/swagger-shim';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class QueryVehicleDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsOptional()
  @IsMongoId()
  customerId?: string;

  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsOptional()
  @IsMongoId()
  vehicleTypeId?: string;

  @ApiPropertyOptional({
    example: '51A',
    description: 'Substring match on plate',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  licensePlate?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value === 'true' : !!value,
  )
  @IsBoolean()
  isActive?: boolean;
}

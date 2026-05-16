import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

export class UpdateVehicleDto {
  @ApiPropertyOptional({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsOptional()
  @IsMongoId()
  vehicleTypeId?: string;

  @ApiPropertyOptional({ example: '51A-12345' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z0-9.\-\s]{4,20}$/, {
    message: 'licensePlate must be 4-20 alphanumeric chars (incl. -, ., space)',
  })
  @MaxLength(20)
  licensePlate?: string;

  @ApiPropertyOptional({ example: 'My city ride' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  nickname?: string;

  @ApiPropertyOptional({ example: 'Honda' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  brand?: string;

  @ApiPropertyOptional({ example: 'Wave Alpha' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  model?: string;

  @ApiPropertyOptional({ example: 'Red' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  color?: string;
}

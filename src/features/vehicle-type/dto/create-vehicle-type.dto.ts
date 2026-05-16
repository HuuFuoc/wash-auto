import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateVehicleTypeDto {
  @ApiProperty({ example: 'Motorbike' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;

  @ApiPropertyOptional({ example: '2-wheel motor vehicles' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}

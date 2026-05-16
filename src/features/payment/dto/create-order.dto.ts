import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateOrderDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8', description: 'Vehicle ID' })
  @IsMongoId()
  vehicleId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8', description: 'Service type ID' })
  @IsMongoId()
  serviceTypeId: string;

  @ApiPropertyOptional({ example: 'Rua xe truoc tet', maxLength: 100 })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  notes?: string;
}

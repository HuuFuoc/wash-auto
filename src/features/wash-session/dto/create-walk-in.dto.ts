import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateWalkInDto {
  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Customer who owns the vehicle.',
  })
  @IsMongoId()
  customerId: string;

  @ApiProperty({
    example: '6601e3b3f1a2c3a4b5d6e7f8',
    description: 'Vehicle to be washed. Must belong to customerId.',
  })
  @IsMongoId()
  vehicleId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  @IsMongoId()
  serviceTypeId: string;

  @ApiPropertyOptional({ example: 'Khách qua đường, không đặt trước' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

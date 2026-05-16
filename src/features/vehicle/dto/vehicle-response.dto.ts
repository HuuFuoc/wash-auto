import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { VehicleDocument } from '../entities/vehicle.entity';

export class VehicleResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  vehicleTypeId: string;

  @ApiProperty({ example: '51A-12345' })
  licensePlate: string;

  @ApiPropertyOptional({ example: 'My city ride' })
  nickname?: string;

  @ApiPropertyOptional({ example: 'Honda' })
  brand?: string;

  @ApiPropertyOptional({ example: 'Wave Alpha' })
  model?: string;

  @ApiPropertyOptional({ example: 'Red' })
  color?: string;

  @ApiProperty({ example: true })
  isDefault: boolean;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(doc: VehicleDocument): VehicleResponseDto {
    const dto = new VehicleResponseDto();
    dto.id = doc._id.toString();
    dto.customerId = doc.customer_id.toString();
    dto.vehicleTypeId = doc.vehicle_type_id.toString();
    dto.licensePlate = doc.license_plate;
    dto.nickname = doc.nickname;
    dto.brand = doc.brand;
    dto.model = doc.car_model;
    dto.color = doc.color;
    dto.isDefault = doc.is_default;
    dto.isActive = doc.is_active;
    return dto;
  }
}

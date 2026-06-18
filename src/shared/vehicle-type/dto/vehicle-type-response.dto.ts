import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { VehicleTypeDocument } from '../../../modules/vehicle-type/vehicle-type.model';

export class VehicleTypeResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: 'Motorbike' })
  name: string;

  @ApiPropertyOptional({ example: '2-wheel motor vehicles' })
  description?: string;

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(doc: VehicleTypeDocument): VehicleTypeResponseDto {
    const dto = new VehicleTypeResponseDto();
    dto.id = doc._id.toString();
    dto.name = doc.name;
    dto.description = doc.description;
    dto.isActive = doc.is_active;
    return dto;
  }
}

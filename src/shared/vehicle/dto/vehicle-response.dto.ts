import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { Types } from 'mongoose';
import { VehicleDocument } from '../../../modules/vehicle/vehicle.model';

export class VehicleResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  customerId: string;

  @ApiPropertyOptional({
    example: 'Nguyễn Văn A',
    description: 'Owner name. Present only when the list query populated it.',
  })
  ownerName?: string;

  @ApiPropertyOptional({ example: '0901234567' })
  ownerPhone?: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  vehicleTypeId: string;

  @ApiPropertyOptional({
    example: 'Motorbike',
    description: 'Vehicle type name. Present only when populated.',
  })
  vehicleTypeName?: string;

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

    // customer_id / vehicle_type_id may be a raw ObjectId (customer paths) or
    // a populated sub-document (admin list query). Read name when populated.
    const cust: unknown = doc.customer_id;
    if (cust && typeof cust === 'object' && '_id' in cust) {
      const c = cust as { _id: Types.ObjectId; name?: string; phone?: string };
      dto.customerId = c._id.toString();
      dto.ownerName = c.name;
      dto.ownerPhone = c.phone;
    } else {
      dto.customerId = doc.customer_id.toString();
    }

    const vt: unknown = doc.vehicle_type_id;
    if (vt && typeof vt === 'object' && '_id' in vt) {
      const t = vt as { _id: Types.ObjectId; name?: string };
      dto.vehicleTypeId = t._id.toString();
      dto.vehicleTypeName = t.name;
    } else {
      dto.vehicleTypeId = doc.vehicle_type_id.toString();
    }

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

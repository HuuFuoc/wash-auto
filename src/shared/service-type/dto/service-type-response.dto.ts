import { ApiProperty, ApiPropertyOptional } from '../../../common/swagger-shim';
import { ServiceTypeDocument } from '../../../modules/service-type/service-type.model';

/** One row of a service's price board, as returned to clients. */
export class VehiclePricingResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  vehicleTypeId: string;

  @ApiPropertyOptional({ example: 'Sedan 4 chỗ' })
  vehicleTypeName?: string;

  @ApiProperty({ example: '60000' })
  price: string;

  @ApiProperty({ example: 30 })
  estimatedMinutes: number;

  @ApiProperty({ example: true })
  isActive: boolean;
}

export class ServiceTypeResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: 'Premium Wash' })
  name: string;

  @ApiPropertyOptional({ example: 'Exterior + interior + tire shine' })
  description?: string;

  @ApiProperty({ example: '80000' })
  basePrice: string;

  @ApiProperty({ example: 30 })
  estimatedMinutes: number;

  @ApiProperty({ example: 1.5 })
  pointsMultiplier: number;

  @ApiProperty({
    type: [String],
    example: ['Rửa thân xe', 'Hút bụi nội thất', 'Lau khô'],
  })
  checklistTemplate: string[];

  @ApiProperty({
    example: true,
    description:
      'FE: hide the "Áp voucher" button when false. BE rejects voucher ' +
      'redemption on this service with HTTP 400.',
  })
  isVoucherEligible: boolean;

  @ApiProperty({
    type: [VehiclePricingResponseDto],
    description:
      'Per-vehicle-type price + duration. FE: show only rows with ' +
      'isActive=true when booking; price/duration come from the matching row.',
  })
  vehiclePricing: VehiclePricingResponseDto[];

  @ApiProperty({ example: true })
  isActive: boolean;

  /**
   * @param doc service document
   * @param vehicleTypeNames optional id→name map to label each pricing row
   */
  static fromDocument(
    doc: ServiceTypeDocument,
    vehicleTypeNames?: Map<string, string>,
  ): ServiceTypeResponseDto {
    const dto = new ServiceTypeResponseDto();
    dto.id = doc._id.toString();
    dto.name = doc.name;
    dto.description = doc.description;
    dto.basePrice = doc.base_price.toString();
    dto.estimatedMinutes = doc.estimated_minutes;
    dto.pointsMultiplier = doc.points_multiplier;
    dto.checklistTemplate = doc.checklist_template ?? [];
    dto.isVoucherEligible = doc.is_voucher_eligible ?? true;
    dto.vehiclePricing = (doc.vehicle_pricing ?? []).map((p) => {
      const vehicleTypeId = p.vehicle_type_id.toString();
      return {
        vehicleTypeId,
        vehicleTypeName: vehicleTypeNames?.get(vehicleTypeId),
        price: p.price.toString(),
        estimatedMinutes: p.estimated_minutes,
        isActive: p.is_active,
      };
    });
    dto.isActive = doc.is_active;
    return dto;
  }
}

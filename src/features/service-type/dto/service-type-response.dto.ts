import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceTypeDocument } from '../entities/service-type.entity';

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

  @ApiProperty({ example: true })
  isActive: boolean;

  static fromDocument(doc: ServiceTypeDocument): ServiceTypeResponseDto {
    const dto = new ServiceTypeResponseDto();
    dto.id = doc._id.toString();
    dto.name = doc.name;
    dto.description = doc.description;
    dto.basePrice = doc.base_price.toString();
    dto.estimatedMinutes = doc.estimated_minutes;
    dto.pointsMultiplier = doc.points_multiplier;
    dto.checklistTemplate = doc.checklist_template ?? [];
    dto.isActive = doc.is_active;
    return dto;
  }
}

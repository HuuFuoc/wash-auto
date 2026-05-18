import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InspectionDocument } from '../entities/inspection.entity';
import { InspectionPhaseEnum } from '../types/inspection-phase.enum';

export class InspectionResponseDto {
  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  id: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  washSessionId: string;

  @ApiProperty({ example: '6601e3b3f1a2c3a4b5d6e7f8' })
  inspectorId: string;

  @ApiProperty({
    enum: InspectionPhaseEnum,
    example: InspectionPhaseEnum.BEFORE,
  })
  phase: InspectionPhaseEnum;

  @ApiPropertyOptional()
  damageNotes?: string;

  @ApiProperty({ example: false })
  customerAcknowledged: boolean;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/sig.png' })
  customerSignatureUrl?: string;

  static fromDocument(doc: InspectionDocument): InspectionResponseDto {
    const dto = new InspectionResponseDto();
    dto.id = doc._id.toString();
    dto.washSessionId = doc.wash_session_id.toString();
    dto.inspectorId = doc.inspector_id.toString();
    dto.phase = doc.phase;
    dto.damageNotes = doc.damage_notes;
    dto.customerAcknowledged = doc.customer_acknowledged;
    dto.customerSignatureUrl = doc.customer_signature_url;
    return dto;
  }
}

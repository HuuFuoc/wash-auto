import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
} from 'class-validator';
import { InspectionPhaseEnum } from '../types/inspection-phase.enum';

export class CreateInspectionDto {
  @ApiProperty({
    enum: InspectionPhaseEnum,
    example: InspectionPhaseEnum.BEFORE,
  })
  @IsEnum(InspectionPhaseEnum)
  phase: InspectionPhaseEnum;

  @ApiPropertyOptional({
    example: 'Xước nhẹ cản trước; gương phải lung lay',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  damageNotes?: string;

  @ApiPropertyOptional({
    example: 'https://cdn.example.com/signatures/abc.png',
    description: 'Customer signature image URL (optional at create time)',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  customerSignatureUrl?: string;
}

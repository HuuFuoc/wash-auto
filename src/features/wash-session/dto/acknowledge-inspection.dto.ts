import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUrl, MaxLength } from 'class-validator';

export class AcknowledgeInspectionDto {
  @ApiPropertyOptional({
    example: 'https://cdn.example.com/signatures/abc.png',
    description: 'Customer signature image URL captured at acknowledgement',
  })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(500)
  customerSignatureUrl?: string;
}

import { ApiProperty } from '@nestjs/swagger';
import { PricingPolicyDocument } from '../entities/pricing-policy.entity';

export class PricingPolicyResponseDto {
  @ApiProperty({
    example: 50,
    description:
      'Max combined golden-hour + tier discount percent, applied before any ' +
      'voucher.',
  })
  maxStackedDiscountPercent: number;

  @ApiProperty()
  updatedAt: Date;

  static fromDocument(doc: PricingPolicyDocument): PricingPolicyResponseDto {
    const dto = new PricingPolicyResponseDto();
    dto.maxStackedDiscountPercent = doc.max_stacked_discount_percent;
    const ts = doc as unknown as { updated_at: Date };
    dto.updatedAt = ts.updated_at;
    return dto;
  }
}

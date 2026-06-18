import { PricingPolicyResponseDto } from '../../features/pricing-policy/dto/pricing-policy-response.dto';
import { UpdatePricingPolicyDto } from '../../features/pricing-policy/dto/update-pricing-policy.dto';
import { PricingPolicyRepository } from './pricing-policy.repository';

/** Fallback cap used only if the singleton has somehow not been seeded. */
export const DEFAULT_MAX_STACKED_DISCOUNT_PERCENT = 50;

// Business logic copied verbatim from
// features/pricing-policy/pricing-policy.service.ts; only DI + Logger swapped.
export class PricingPolicyService {
  constructor(private readonly repository: PricingPolicyRepository) {}

  /** Creates the singleton with defaults on first boot (idempotent). */
  async seedDefaults(): Promise<void> {
    await this.repository.ensureSingleton();
  }

  async get(): Promise<PricingPolicyResponseDto> {
    const doc = await this.repository.ensureSingleton();
    return PricingPolicyResponseDto.fromDocument(doc);
  }

  async update(dto: UpdatePricingPolicyDto): Promise<PricingPolicyResponseDto> {
    const doc = await this.repository.updateMaxStackedDiscountPercent(
      dto.maxStackedDiscountPercent,
    );
    console.log(
      `Pricing policy updated: maxStackedDiscountPercent=${dto.maxStackedDiscountPercent}`,
    );
    return PricingPolicyResponseDto.fromDocument(doc);
  }

  /**
   * The admin-configured ceiling for the golden-hour + tier discount stack.
   * Falls back to the default if the singleton is missing, so pricing never
   * breaks on a fresh database.
   */
  async getMaxStackedDiscountPercent(): Promise<number> {
    const doc = await this.repository.findSingleton();
    return (
      doc?.max_stacked_discount_percent ?? DEFAULT_MAX_STACKED_DISCOUNT_PERCENT
    );
  }
}

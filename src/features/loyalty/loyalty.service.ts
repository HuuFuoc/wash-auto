import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { TierConfigRepository } from '../tier-config/repositories/tier-config.repository';
import { TierNameEnum } from '../tier-config/types/tier-name.enum';
import { LoyaltyAccountResponseDto } from './dto/loyalty-account-response.dto';
import { LoyaltyAccountDocument } from './entities/loyalty-account.entity';
import { LoyaltyAccountRepository } from './repositories/loyalty-account.repository';

@Injectable()
export class LoyaltyService {
  private readonly logger = new Logger(LoyaltyService.name);

  constructor(
    private readonly loyaltyRepository: LoyaltyAccountRepository,
    private readonly tierConfigRepository: TierConfigRepository,
  ) {}

  /**
   * Ensures a loyalty account exists for the customer. Called on register
   * AND lazily on any read endpoint so old customers also receive one.
   * Idempotent — returns the existing account if already present.
   */
  async ensureForCustomer(
    customerId: Types.ObjectId | string,
  ): Promise<LoyaltyAccountDocument> {
    const existing = await this.loyaltyRepository.findByCustomerId(customerId);
    if (existing) return existing;

    const memberTier = await this.tierConfigRepository.findByName(
      TierNameEnum.MEMBER,
    );
    if (!memberTier) {
      throw new InternalServerErrorException(
        'Member tier_config not seeded — restart app',
      );
    }

    const created = await this.loyaltyRepository.create({
      customerId: new Types.ObjectId(customerId),
      tierConfigId: memberTier._id,
    });
    this.logger.log('Created loyalty account at Member tier', {
      customerId: customerId.toString(),
    });
    return created;
  }

  async getForCustomer(customerId: string): Promise<LoyaltyAccountResponseDto> {
    const account = await this.ensureForCustomer(customerId);
    const tier = await this.tierConfigRepository.findById(
      account.tier_config_id,
    );
    if (!tier) {
      throw new NotFoundException(
        'Linked tier_config not found — DB inconsistent',
      );
    }
    return LoyaltyAccountResponseDto.fromDocument(account, tier.tier_name);
  }
}

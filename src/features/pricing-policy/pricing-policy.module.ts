import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminPricingPolicyController } from './admin-pricing-policy.controller';
import {
  PricingPolicy,
  PricingPolicySchema,
} from './entities/pricing-policy.entity';
import { PricingPolicyService } from './pricing-policy.service';
import { PricingPolicyRepository } from './repositories/pricing-policy.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PricingPolicy.name, schema: PricingPolicySchema },
    ]),
  ],
  controllers: [AdminPricingPolicyController],
  providers: [PricingPolicyService, PricingPolicyRepository],
  exports: [PricingPolicyService],
})
export class PricingPolicyModule implements OnModuleInit {
  private readonly logger = new Logger(PricingPolicyModule.name);

  constructor(private readonly service: PricingPolicyService) {}

  async onModuleInit(): Promise<void> {
    await this.service.seedDefaults();
    this.logger.log('Pricing policy ready');
  }
}

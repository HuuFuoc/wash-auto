import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AdminTierConfigController } from './admin-tier-config.controller';
import { TierConfig, TierConfigSchema } from './entities/tier-config.entity';
import { TierConfigRepository } from './repositories/tier-config.repository';
import { TierConfigController } from './tier-config.controller';
import { TierConfigService } from './tier-config.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TierConfig.name, schema: TierConfigSchema },
    ]),
  ],
  controllers: [TierConfigController, AdminTierConfigController],
  providers: [TierConfigService, TierConfigRepository],
  exports: [TierConfigService, TierConfigRepository],
})
export class TierConfigModule implements OnModuleInit {
  private readonly logger = new Logger(TierConfigModule.name);

  constructor(private readonly service: TierConfigService) {}

  async onModuleInit(): Promise<void> {
    await this.service.seedDefaults();
    this.logger.log('Tier configs ready');
  }
}

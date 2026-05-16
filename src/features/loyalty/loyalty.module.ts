import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TierConfigModule } from '../tier-config/tier-config.module';
import {
  LoyaltyAccount,
  LoyaltyAccountSchema,
} from './entities/loyalty-account.entity';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyAccountRepository } from './repositories/loyalty-account.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LoyaltyAccount.name, schema: LoyaltyAccountSchema },
    ]),
    TierConfigModule,
  ],
  controllers: [LoyaltyController],
  providers: [LoyaltyService, LoyaltyAccountRepository],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}

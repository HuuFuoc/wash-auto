import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TierConfigModule } from '../tier-config/tier-config.module';
import { VoucherModule } from '../voucher/voucher.module';
import {
  LoyaltyAccount,
  LoyaltyAccountSchema,
} from './entities/loyalty-account.entity';
import {
  LoyaltyTransaction,
  LoyaltyTransactionSchema,
} from './entities/loyalty-transaction.entity';
import { LoyaltyAnnualResetCron } from './jobs/loyalty-annual-reset.cron';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyService } from './loyalty.service';
import { LoyaltyAccountRepository } from './repositories/loyalty-account.repository';
import { LoyaltyTransactionRepository } from './repositories/loyalty-transaction.repository';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: LoyaltyAccount.name, schema: LoyaltyAccountSchema },
      { name: LoyaltyTransaction.name, schema: LoyaltyTransactionSchema },
    ]),
    TierConfigModule,
    VoucherModule,
  ],
  controllers: [LoyaltyController],
  providers: [
    LoyaltyService,
    LoyaltyAccountRepository,
    LoyaltyTransactionRepository,
    LoyaltyAnnualResetCron,
  ],
  exports: [LoyaltyService],
})
export class LoyaltyModule {}

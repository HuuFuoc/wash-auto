import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { TierConfigRepository } from '../tier-config/tier-config.repository';
import { voucherService } from '../voucher/voucher.router';
import { registerLoyaltyAnnualResetCron } from './loyalty-annual-reset.cron';
import { LoyaltyController } from './loyalty.controller';
import { LoyaltyAccountRepository } from './loyalty-account.repository';
import { LoyaltyTransactionRepository } from './loyalty-transaction.repository';
import { LoyaltyService } from './loyalty.service';

// Manual DI wiring. Reuses the shared VoucherService instance (loyalty → voucher
// is one-way; voucher never imports loyalty, so no cycle).
const accountRepository = new LoyaltyAccountRepository();
const transactionRepository = new LoyaltyTransactionRepository();
const tierConfigRepository = new TierConfigRepository();
const service = new LoyaltyService(
  accountRepository,
  transactionRepository,
  tierConfigRepository,
  voucherService,
);
const controller = new LoyaltyController(service);

// Customer router — mounted at /me/loyalty. Equivalent of @UseGuards(JwtAuthGuard).
export const meLoyaltyRouter = Router();
meLoyaltyRouter.use(authMiddleware);
meLoyaltyRouter.get('/', asyncHandler(controller.getMine));
meLoyaltyRouter.get('/transactions', asyncHandler(controller.listTransactions));

// Shared instance so auth (register) and order reuse it once migrated.
export const loyaltyService = service;

// Registered from the server bootstrap (replaces LoyaltyAnnualResetCron).
export function registerLoyaltyCron(): void {
  registerLoyaltyAnnualResetCron(service);
}

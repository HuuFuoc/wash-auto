import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { CreateVoucherCampaignDto } from '../../shared/voucher-campaign/dto/create-voucher-campaign.dto';
import { QueryPublicVoucherCampaignDto } from '../../shared/voucher-campaign/dto/query-public-voucher-campaign.dto';
import { QueryVoucherCampaignDto } from '../../shared/voucher-campaign/dto/query-voucher-campaign.dto';
import { UpdateVoucherCampaignDto } from '../../shared/voucher-campaign/dto/update-voucher-campaign.dto';
import {
  authMiddleware,
  optionalAuthMiddleware,
} from '../../middlewares/auth.middleware';
import { voucherClaimRateLimiter } from '../../middlewares/rate-limit.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { VoucherRedemptionRepository } from '../voucher/voucher-redemption.repository';
import { VoucherRepository } from '../voucher/voucher.repository';
import { voucherService } from '../voucher/voucher.router';
import { AdminVoucherCampaignController } from './admin-voucher-campaign.controller';
import { VoucherCampaignController } from './voucher-campaign.controller';
import { registerVoucherCampaignCrons } from './voucher-campaign.cron';
import { VoucherCampaignRepository } from './voucher-campaign.repository';
import { VoucherCampaignService } from './voucher-campaign.service';

// Manual DI wiring, matching every other module. The voucher repositories are
// imported as CLASSES; they are stateless, so a second instance is free.
// `voucherService` IS the shared instance — voucher.router builds its own
// campaign repository rather than importing this file, so the dependency runs
// one way (voucher-campaign → voucher) with no cycle, exactly as loyalty does.
const repository = new VoucherCampaignRepository();
const service = new VoucherCampaignService(
  repository,
  new VoucherRepository(),
  new VoucherRedemptionRepository(),
);
const adminController = new AdminVoucherCampaignController(service);
const publicController = new VoucherCampaignController(service, voucherService);

// Public router — mounted at /voucher-campaigns. Serves the customer-safe
// projection only.
export const voucherCampaignRouter = Router();
// OPTIONAL auth on the reads: anonymous visitors still get the promotions page,
// while a signed-in one additionally gets `alreadyClaimed` per card. A bad
// token degrades to anonymous rather than 401-ing a public page.
voucherCampaignRouter.get(
  '/',
  optionalAuthMiddleware,
  validateDto(QueryPublicVoucherCampaignDto, 'query'),
  asyncHandler(publicController.list),
);
voucherCampaignRouter.get(
  '/:id',
  optionalAuthMiddleware,
  asyncHandler(publicController.getOne),
);
// One-tap claim. Auth is REQUIRED here — the voucher lands in a named wallet.
// Same limiter as POST /me/vouchers/claim, and the same key (the account), so
// the two claim routes share one budget rather than doubling it; it sits after
// authMiddleware so `req.user.sub` exists to key on.
voucherCampaignRouter.post(
  '/:id/claim',
  authMiddleware,
  voucherClaimRateLimiter,
  asyncHandler(publicController.claim),
);

// Admin router — mounted at /admin/voucher-campaigns.
export const adminVoucherCampaignRouter = Router();
adminVoucherCampaignRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.ADMIN, RoleEnum.MANAGER),
);
adminVoucherCampaignRouter.post(
  '/',
  validateDto(CreateVoucherCampaignDto),
  asyncHandler(adminController.create),
);
adminVoucherCampaignRouter.get(
  '/',
  validateDto(QueryVoucherCampaignDto, 'query'),
  asyncHandler(adminController.list),
);
adminVoucherCampaignRouter.get('/:id', asyncHandler(adminController.getOne));
adminVoucherCampaignRouter.patch(
  '/:id',
  validateDto(UpdateVoucherCampaignDto),
  asyncHandler(adminController.update),
);
adminVoucherCampaignRouter.post(
  '/:id/activate',
  asyncHandler(adminController.activate),
);
adminVoucherCampaignRouter.post(
  '/:id/pause',
  asyncHandler(adminController.pause),
);
adminVoucherCampaignRouter.post('/:id/end', asyncHandler(adminController.end));
adminVoucherCampaignRouter.get(
  '/:id/stats',
  asyncHandler(adminController.stats),
);

// Shared instances so voucher/pricing reuse them instead of building their own.
export const voucherCampaignRepository = repository;
export const voucherCampaignService = service;

/** Registered from the server bootstrap. Local dev only — see the cron file. */
export function registerVoucherCampaignCron(): void {
  registerVoucherCampaignCrons(service);
}

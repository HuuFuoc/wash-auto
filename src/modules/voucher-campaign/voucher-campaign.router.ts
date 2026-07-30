import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { CreateVoucherCampaignDto } from '../../shared/voucher-campaign/dto/create-voucher-campaign.dto';
import { QueryPublicVoucherCampaignDto } from '../../shared/voucher-campaign/dto/query-public-voucher-campaign.dto';
import { QueryVoucherCampaignDto } from '../../shared/voucher-campaign/dto/query-voucher-campaign.dto';
import { UpdateVoucherCampaignDto } from '../../shared/voucher-campaign/dto/update-voucher-campaign.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { VoucherRedemptionRepository } from '../voucher/voucher-redemption.repository';
import { VoucherRepository } from '../voucher/voucher.repository';
import { AdminVoucherCampaignController } from './admin-voucher-campaign.controller';
import { VoucherCampaignController } from './voucher-campaign.controller';
import { registerVoucherCampaignCrons } from './voucher-campaign.cron';
import { VoucherCampaignRepository } from './voucher-campaign.repository';
import { VoucherCampaignService } from './voucher-campaign.service';

// Manual DI wiring, matching every other module. The voucher repositories are
// imported as CLASSES rather than pulled from voucher.router, which would create
// an import cycle (voucher.router already depends on this file for the campaign
// repository). Repositories are stateless, so a second instance is free.
const repository = new VoucherCampaignRepository();
const service = new VoucherCampaignService(
  repository,
  new VoucherRepository(),
  new VoucherRedemptionRepository(),
);
const adminController = new AdminVoucherCampaignController(service);
const publicController = new VoucherCampaignController(service);

// Public router — mounted at /voucher-campaigns. No auth, same as the other
// public config routes. Serves the customer-safe projection only.
export const voucherCampaignRouter = Router();
voucherCampaignRouter.get(
  '/',
  validateDto(QueryPublicVoucherCampaignDto, 'query'),
  asyncHandler(publicController.list),
);
voucherCampaignRouter.get('/:id', asyncHandler(publicController.getOne));

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

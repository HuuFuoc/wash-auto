import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { BulkCreateVoucherDto } from '../../shared/voucher/dto/bulk-create-voucher.dto';
import { ClaimVoucherDto } from '../../shared/voucher/dto/claim-voucher.dto';
import { GrantVoucherAdminDto } from '../../shared/voucher/dto/grant-voucher-admin.dto';
import { QueryVoucherDto } from '../../shared/voucher/dto/query-voucher.dto';
import { RevokeVoucherDto } from '../../shared/voucher/dto/revoke-voucher.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { voucherClaimRateLimiter } from '../../middlewares/rate-limit.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { voucherCampaignRepository } from '../voucher-campaign/voucher-campaign.router';
import { AdminVoucherController } from './admin-voucher.controller';
import { VoucherRedemptionRepository } from './voucher-redemption.repository';
import { registerVoucherExpiryCron } from './voucher-expiry.cron';
import { VoucherController } from './voucher.controller';
import { VoucherRepository } from './voucher.repository';
import { VoucherService } from './voucher.service';

// Manual DI wiring. UserRepository/RoleRepository are stateless and share the
// same model singletons as the auth module (no DI cycle at the service level —
// VoucherService needs auth's repositories, not its services).
const repository = new VoucherRepository();
const redemptionRepository = new VoucherRedemptionRepository();
const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const service = new VoucherService(
  repository,
  userRepository,
  roleRepository,
  voucherCampaignRepository,
  redemptionRepository,
);
const customerController = new VoucherController(service);
const adminController = new AdminVoucherController(service);

// Customer router — mounted at /me/vouchers. Equivalent of @UseGuards(JwtAuthGuard).
export const meVoucherRouter = Router();
meVoucherRouter.use(authMiddleware);
meVoucherRouter.get('/', asyncHandler(customerController.list));
// Limiter sits AFTER authMiddleware (router-level `use` above) so it can key on
// req.user.sub, and BEFORE validation so malformed floods are cheap to reject.
meVoucherRouter.post(
  '/claim',
  voucherClaimRateLimiter,
  validateDto(ClaimVoucherDto),
  asyncHandler(customerController.claim),
);
meVoucherRouter.get('/:id', asyncHandler(customerController.getOne));

// Admin router — mounted at /admin/vouchers. @UseGuards(JwtAuthGuard, RolesGuard)
// + @Roles(ADMIN, MANAGER).
export const adminVoucherRouter = Router();
adminVoucherRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.ADMIN, RoleEnum.MANAGER),
);
adminVoucherRouter.post(
  '/',
  validateDto(GrantVoucherAdminDto),
  asyncHandler(adminController.grant),
);
adminVoucherRouter.post(
  '/bulk',
  validateDto(BulkCreateVoucherDto),
  asyncHandler(adminController.bulkCreate),
);
adminVoucherRouter.get(
  '/',
  validateDto(QueryVoucherDto, 'query'),
  asyncHandler(adminController.list),
);
// Đặt trước '/:id' để 'stats'/'batches' không bị nhận nhầm là id.
adminVoucherRouter.get('/stats', asyncHandler(adminController.stats));
adminVoucherRouter.get('/batches', asyncHandler(adminController.batches));
adminVoucherRouter.get('/:id', asyncHandler(adminController.getOne));
adminVoucherRouter.patch(
  '/:id/revoke',
  validateDto(RevokeVoucherDto),
  asyncHandler(adminController.revoke),
);

// Shared instances so loyalty/order/pricing reuse them once migrated.
export const voucherService = service;
export const voucherRepository = repository;
export const voucherRedemptionRepository = redemptionRepository;

// Registered from the server bootstrap (replaces VoucherExpiryCron).
export function registerVoucherCron(): void {
  registerVoucherExpiryCron(service);
}

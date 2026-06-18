import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { GrantVoucherAdminDto } from '../../shared/voucher/dto/grant-voucher-admin.dto';
import { QueryVoucherDto } from '../../shared/voucher/dto/query-voucher.dto';
import { RevokeVoucherDto } from '../../shared/voucher/dto/revoke-voucher.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { AdminVoucherController } from './admin-voucher.controller';
import { registerVoucherExpiryCron } from './voucher-expiry.cron';
import { VoucherController } from './voucher.controller';
import { VoucherRepository } from './voucher.repository';
import { VoucherService } from './voucher.service';

// Manual DI wiring. UserRepository/RoleRepository are stateless and share the
// same model singletons as the auth module (no DI cycle at the service level —
// VoucherService needs auth's repositories, not its services).
const repository = new VoucherRepository();
const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const service = new VoucherService(repository, userRepository, roleRepository);
const customerController = new VoucherController(service);
const adminController = new AdminVoucherController(service);

// Customer router — mounted at /me/vouchers. Equivalent of @UseGuards(JwtAuthGuard).
export const meVoucherRouter = Router();
meVoucherRouter.use(authMiddleware);
meVoucherRouter.get('/', asyncHandler(customerController.list));
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
adminVoucherRouter.get(
  '/',
  validateDto(QueryVoucherDto, 'query'),
  asyncHandler(adminController.list),
);
adminVoucherRouter.get('/:id', asyncHandler(adminController.getOne));
adminVoucherRouter.patch(
  '/:id/revoke',
  validateDto(RevokeVoucherDto),
  asyncHandler(adminController.revoke),
);

// Shared instances so loyalty/order reuse them once migrated.
export const voucherService = service;
export const voucherRepository = repository;

// Registered from the server bootstrap (replaces VoucherExpiryCron).
export function registerVoucherCron(): void {
  registerVoucherExpiryCron(service);
}

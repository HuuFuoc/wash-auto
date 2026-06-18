import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { UpdatePricingPolicyDto } from '../../shared/pricing-policy/dto/update-pricing-policy.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { AdminPricingPolicyController } from './admin-pricing-policy.controller';
import { PricingPolicyRepository } from './pricing-policy.repository';
import { PricingPolicyService } from './pricing-policy.service';

// Manual DI wiring (replaces Nest's module providers).
const repository = new PricingPolicyRepository();
const service = new PricingPolicyService(repository);
const controller = new AdminPricingPolicyController(service);

// Admin router — mounted at /admin/pricing-policy. Equivalent of
// @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(ADMIN).
export const adminPricingPolicyRouter = Router();
adminPricingPolicyRouter.use(authMiddleware, roleMiddleware(RoleEnum.ADMIN));
adminPricingPolicyRouter.get('/', asyncHandler(controller.get));
adminPricingPolicyRouter.patch(
  '/',
  validateDto(UpdatePricingPolicyDto),
  asyncHandler(controller.update),
);

// Replaces PricingPolicyModule.onModuleInit — called once from the server
// bootstrap after the DB connects.
export async function seedPricingPolicyDefaults(): Promise<void> {
  await service.seedDefaults();
}

// Shared instance so the order/pricing modules reuse it once migrated.
export const pricingPolicyService = service;

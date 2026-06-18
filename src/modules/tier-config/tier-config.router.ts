import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { SetTierConfigStatusDto } from '../../features/tier-config/dto/set-tier-config-status.dto';
import { UpdateTierConfigDto } from '../../features/tier-config/dto/update-tier-config.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { AdminTierConfigController } from './admin-tier-config.controller';
import { TierConfigController } from './tier-config.controller';
import { TierConfigRepository } from './tier-config.repository';
import { TierConfigService } from './tier-config.service';

// Manual DI wiring (replaces Nest's module providers).
const repository = new TierConfigRepository();
const service = new TierConfigService(repository);
const publicController = new TierConfigController(service);
const adminController = new AdminTierConfigController(service);

// Public router — mounted at /tier-configs.
export const tierConfigRouter = Router();
tierConfigRouter.get('/', asyncHandler(publicController.list));
tierConfigRouter.get('/:id', asyncHandler(publicController.getOne));

// Admin router — mounted at /admin/tier-configs. Equivalent of
// @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(ADMIN).
export const adminTierConfigRouter = Router();
adminTierConfigRouter.use(authMiddleware, roleMiddleware(RoleEnum.ADMIN));
adminTierConfigRouter.get('/', asyncHandler(adminController.listAll));
adminTierConfigRouter.patch(
  '/:id',
  validateDto(UpdateTierConfigDto),
  asyncHandler(adminController.update),
);
adminTierConfigRouter.patch(
  '/:id/status',
  validateDto(SetTierConfigStatusDto),
  asyncHandler(adminController.setStatus),
);

// Replaces TierConfigModule.onModuleInit — called once from the server
// bootstrap after the DB connects.
export async function seedTierConfigDefaults(): Promise<void> {
  await service.seedDefaults();
}

// Shared instances so the loyalty module reuses them once migrated
// (TierConfigModule exported both the service and the repository).
export const tierConfigService = service;
export const tierConfigRepository = repository;

import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { CreateGoldenHourDto } from '../../shared/golden-hour/dto/create-golden-hour.dto';
import { UpdateGoldenHourDto } from '../../shared/golden-hour/dto/update-golden-hour.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { AdminGoldenHourController } from './admin-golden-hour.controller';
import { GoldenHourConfigRepository } from './golden-hour.repository';
import { GoldenHourService } from './golden-hour.service';

// Manual DI wiring (replaces Nest's module providers).
const repository = new GoldenHourConfigRepository();
const service = new GoldenHourService(repository);
const controller = new AdminGoldenHourController(service);

// Admin router — mounted at /admin/golden-hours. Equivalent of
// @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(MANAGER, ADMIN).
export const adminGoldenHourRouter = Router();
adminGoldenHourRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.MANAGER, RoleEnum.ADMIN),
);
adminGoldenHourRouter.get('/', asyncHandler(controller.list));
adminGoldenHourRouter.post(
  '/',
  validateDto(CreateGoldenHourDto),
  asyncHandler(controller.create),
);
adminGoldenHourRouter.patch(
  '/:id',
  validateDto(UpdateGoldenHourDto),
  asyncHandler(controller.update),
);
adminGoldenHourRouter.delete('/:id', asyncHandler(controller.remove));

// Replaces GoldenHourModule.onModuleInit — called once from the server
// bootstrap after the DB connects.
export async function seedGoldenHourDefaults(): Promise<void> {
  await service.seedDefaults();
}

// Shared instance so order/pricing modules reuse it once they are migrated.
export const goldenHourService = service;

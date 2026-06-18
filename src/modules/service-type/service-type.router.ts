import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { CreateServiceTypeDto } from '../../shared/service-type/dto/create-service-type.dto';
import { SetServiceTypeStatusDto } from '../../shared/service-type/dto/set-service-type-status.dto';
import { UpdateServiceTypeDto } from '../../shared/service-type/dto/update-service-type.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { VehicleTypeRepository } from '../vehicle-type/vehicle-type.repository';
import { AdminServiceTypeController } from './admin-service-type.controller';
import { ServiceTypeController } from './service-type.controller';
import { ServiceTypeRepository } from './service-type.repository';
import { ServiceTypeService } from './service-type.service';

// Manual DI wiring (replaces Nest's module providers; VehicleTypeRepository is
// stateless so a fresh instance shares the same model singleton).
const repository = new ServiceTypeRepository();
const vehicleTypeRepository = new VehicleTypeRepository();
const service = new ServiceTypeService(repository, vehicleTypeRepository);
const publicController = new ServiceTypeController(service);
const adminController = new AdminServiceTypeController(service);

// Public router — mounted at /service-types.
export const serviceTypeRouter = Router();
serviceTypeRouter.get('/', asyncHandler(publicController.list));
serviceTypeRouter.get('/:id', asyncHandler(publicController.getOne));

// Admin router — mounted at /admin/service-types. Equivalent of
// @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(ADMIN, MANAGER).
export const adminServiceTypeRouter = Router();
adminServiceTypeRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.ADMIN, RoleEnum.MANAGER),
);
adminServiceTypeRouter.get('/', asyncHandler(adminController.listAll));
adminServiceTypeRouter.post(
  '/',
  validateDto(CreateServiceTypeDto),
  asyncHandler(adminController.create),
);
adminServiceTypeRouter.patch(
  '/:id',
  validateDto(UpdateServiceTypeDto),
  asyncHandler(adminController.update),
);
adminServiceTypeRouter.patch(
  '/:id/status',
  validateDto(SetServiceTypeStatusDto),
  asyncHandler(adminController.setActive),
);

// Shared instances so order/work-order/chat/user reuse them once migrated.
export const serviceTypeService = service;
export const serviceTypeRepository = repository;

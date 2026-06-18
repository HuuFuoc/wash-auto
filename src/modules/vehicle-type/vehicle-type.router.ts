import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { CreateVehicleTypeDto } from '../../features/vehicle-type/dto/create-vehicle-type.dto';
import { SetVehicleTypeStatusDto } from '../../features/vehicle-type/dto/set-vehicle-type-status.dto';
import { UpdateVehicleTypeDto } from '../../features/vehicle-type/dto/update-vehicle-type.dto';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { AdminVehicleTypeController } from './admin-vehicle-type.controller';
import { VehicleTypeController } from './vehicle-type.controller';
import { VehicleTypeRepository } from './vehicle-type.repository';
import { VehicleTypeService } from './vehicle-type.service';

// Manual DI wiring (replaces Nest's module providers).
const repository = new VehicleTypeRepository();
const service = new VehicleTypeService(repository);
const publicController = new VehicleTypeController(service);
const adminController = new AdminVehicleTypeController(service);

// Public router — mounted at /vehicle-types.
export const vehicleTypeRouter = Router();
vehicleTypeRouter.get('/', asyncHandler(publicController.list));
vehicleTypeRouter.get('/:id', asyncHandler(publicController.getOne));

// Admin router — mounted at /admin/vehicle-types. Equivalent of
// @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(ADMIN, MANAGER).
export const adminVehicleTypeRouter = Router();
adminVehicleTypeRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.ADMIN, RoleEnum.MANAGER),
);
adminVehicleTypeRouter.get('/', asyncHandler(adminController.listAll));
adminVehicleTypeRouter.post(
  '/',
  validateDto(CreateVehicleTypeDto),
  asyncHandler(adminController.create),
);
adminVehicleTypeRouter.patch(
  '/:id',
  validateDto(UpdateVehicleTypeDto),
  asyncHandler(adminController.update),
);
adminVehicleTypeRouter.patch(
  '/:id/status',
  validateDto(SetVehicleTypeStatusDto),
  asyncHandler(adminController.setActive),
);

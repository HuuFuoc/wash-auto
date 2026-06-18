import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { CreateVehicleDto } from '../../features/vehicle/dto/create-vehicle.dto';
import { QueryVehicleDto } from '../../features/vehicle/dto/query-vehicle.dto';
import { UpdateVehicleDto } from '../../features/vehicle/dto/update-vehicle.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { VehicleTypeRepository } from '../vehicle-type/vehicle-type.repository';
import { AdminVehicleController } from './admin-vehicle.controller';
import { VehicleController } from './vehicle.controller';
import { VehicleRepository } from './vehicle.repository';
import { VehicleService } from './vehicle.service';

// Manual DI wiring (VehicleTypeRepository is stateless — shares the same model
// singleton as the vehicle-type module).
const repository = new VehicleRepository();
const vehicleTypeRepository = new VehicleTypeRepository();
const service = new VehicleService(repository, vehicleTypeRepository);
const meController = new VehicleController(service);
const adminController = new AdminVehicleController(service);

// Customer router — mounted at /me/vehicles. Equivalent of @UseGuards(JwtAuthGuard).
export const meVehicleRouter = Router();
meVehicleRouter.use(authMiddleware);
meVehicleRouter.get('/', asyncHandler(meController.list));
meVehicleRouter.get('/:id', asyncHandler(meController.getOne));
meVehicleRouter.post(
  '/',
  validateDto(CreateVehicleDto),
  asyncHandler(meController.create),
);
meVehicleRouter.patch(
  '/:id',
  validateDto(UpdateVehicleDto),
  asyncHandler(meController.update),
);
meVehicleRouter.patch('/:id/set-default', asyncHandler(meController.setDefault));
meVehicleRouter.delete('/:id', asyncHandler(meController.remove));

// Admin router — mounted at /admin/vehicles. Equivalent of
// @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(ADMIN, MANAGER).
export const adminVehicleRouter = Router();
adminVehicleRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.ADMIN, RoleEnum.MANAGER),
);
adminVehicleRouter.get(
  '/',
  validateDto(QueryVehicleDto, 'query'),
  asyncHandler(adminController.list),
);
adminVehicleRouter.get('/:id', asyncHandler(adminController.getOne));

// Shared instances so order/work-order reuse them once migrated.
export const vehicleService = service;
export const vehicleRepository = repository;

import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { CreateStaffShiftDto } from '../../shared/staff-shift/dto/create-staff-shift.dto';
import { QueryAvailableShiftDto } from '../../shared/staff-shift/dto/query-available-shift.dto';
import { QueryStaffShiftDto } from '../../shared/staff-shift/dto/query-staff-shift.dto';
import { SetStaffShiftStatusDto } from '../../shared/staff-shift/dto/set-staff-shift-status.dto';
import { UpdateStaffShiftDto } from '../../shared/staff-shift/dto/update-staff-shift.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { AdminStaffShiftController } from './admin-staff-shift.controller';
import { StaffShiftController } from './staff-shift.controller';
import { StaffShiftRepository } from './staff-shift.repository';
import { StaffShiftService } from './staff-shift.service';

// Manual DI wiring (User/Role repositories are stateless, shared model singletons).
const repository = new StaffShiftRepository();
const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const service = new StaffShiftService(repository, userRepository, roleRepository);
const publicController = new StaffShiftController(service);
const adminController = new AdminStaffShiftController(service);

// Authenticated router — mounted at /shifts. Equivalent of @UseGuards(JwtAuthGuard).
export const shiftRouter = Router();
shiftRouter.use(authMiddleware);
shiftRouter.get(
  '/available',
  validateDto(QueryAvailableShiftDto, 'query'),
  asyncHandler(publicController.listAvailable),
);

// Admin router — mounted at /admin/shifts. @UseGuards(JwtAuthGuard, RolesGuard)
// + @Roles(MANAGER, ADMIN). `/staff` MUST be registered before `/:id`.
export const adminShiftRouter = Router();
adminShiftRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.MANAGER, RoleEnum.ADMIN),
);
adminShiftRouter.get(
  '/',
  validateDto(QueryStaffShiftDto, 'query'),
  asyncHandler(adminController.list),
);
adminShiftRouter.get('/staff', asyncHandler(adminController.assignableStaff));
adminShiftRouter.get('/:id', asyncHandler(adminController.getOne));
adminShiftRouter.post(
  '/',
  validateDto(CreateStaffShiftDto),
  asyncHandler(adminController.create),
);
adminShiftRouter.patch(
  '/:id',
  validateDto(UpdateStaffShiftDto),
  asyncHandler(adminController.update),
);
adminShiftRouter.patch(
  '/:id/status',
  validateDto(SetStaffShiftStatusDto),
  asyncHandler(adminController.setStatus),
);

// Shared instances so order/work-order reuse them once migrated.
export const staffShiftService = service;
export const staffShiftRepository = repository;

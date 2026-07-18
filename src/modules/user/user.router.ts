import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { ChangeMyPasswordDto } from '../../shared/user/dto/change-my-password.dto';
import { ChangeUserRoleDto } from '../../shared/user/dto/change-user-role.dto';
import { CreateUserAdminDto } from '../../shared/user/dto/create-user-admin.dto';
import { QueryUserDto } from '../../shared/user/dto/query-user.dto';
import { ResetUserPasswordDto } from '../../shared/user/dto/reset-user-password.dto';
import { SetUserStatusDto } from '../../shared/user/dto/set-user-status.dto';
import { UpdateUserDto } from '../../shared/user/dto/update-user.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { AdminUserController } from './admin-user.controller';
import { MeUserController } from './me-user.controller';
import { UserService } from './user.service';

// Manual DI wiring (reuses auth's stateless User/Role repositories).
const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const service = new UserService(userRepository, roleRepository);
const controller = new AdminUserController(service);
const meController = new MeUserController(service);

// Self-service router — mounted at /me/profile. Any authenticated role; every
// handler operates on the caller's own account only.
export const meUserRouter = Router();
meUserRouter.use(authMiddleware);
meUserRouter.get('/', asyncHandler(meController.getProfile));
meUserRouter.patch(
  '/',
  validateDto(UpdateUserDto),
  asyncHandler(meController.updateProfile),
);
meUserRouter.post(
  '/change-password',
  validateDto(ChangeMyPasswordDto),
  asyncHandler(meController.changePassword),
);

// Admin router — mounted at /admin/users. @UseGuards(JwtAuthGuard, RolesGuard)
// + @Roles(ADMIN).
export const adminUserRouter = Router();
adminUserRouter.use(authMiddleware, roleMiddleware(RoleEnum.ADMIN));
adminUserRouter.get(
  '/',
  validateDto(QueryUserDto, 'query'),
  asyncHandler(controller.list),
);
adminUserRouter.get('/:id', asyncHandler(controller.getOne));
adminUserRouter.post(
  '/',
  validateDto(CreateUserAdminDto),
  asyncHandler(controller.create),
);
adminUserRouter.patch(
  '/:id',
  validateDto(UpdateUserDto),
  asyncHandler(controller.update),
);
adminUserRouter.patch(
  '/:id/role',
  validateDto(ChangeUserRoleDto),
  asyncHandler(controller.changeRole),
);
adminUserRouter.patch(
  '/:id/status',
  validateDto(SetUserStatusDto),
  asyncHandler(controller.setStatus),
);
adminUserRouter.post(
  '/:id/reset-password',
  validateDto(ResetUserPasswordDto),
  asyncHandler(controller.resetPassword),
);
adminUserRouter.delete('/:id', asyncHandler(controller.softDelete));

import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { QueryDashboardDto } from '../../shared/dashboard/dto/query-dashboard.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

// Manual DI wiring. The service reads the migrated model singletons directly,
// so no repositories are injected.
const service = new DashboardService();
const controller = new DashboardController(service);

// Admin router — mounted at /admin/dashboard. Equivalent of
// @UseGuards(JwtAuthGuard, RolesGuard) + @Roles(MANAGER, ADMIN).
export const adminDashboardRouter = Router();
adminDashboardRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.MANAGER, RoleEnum.ADMIN),
);
adminDashboardRouter.get(
  '/',
  validateDto(QueryDashboardDto, 'query'),
  asyncHandler(controller.getReport),
);

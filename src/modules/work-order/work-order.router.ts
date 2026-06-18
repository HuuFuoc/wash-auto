import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { AssignWasherDto } from '../../features/work-order/dto/assign-washer.dto';
import { CreateWorkOrderDto } from '../../features/work-order/dto/create-work-order.dto';
import { FinishWorkOrderDto } from '../../features/work-order/dto/finish-work-order.dto';
import { QcWorkOrderDto } from '../../features/work-order/dto/qc-work-order.dto';
import { QueryWorkOrderDto } from '../../features/work-order/dto/query-work-order.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { orderRepository, orderService } from '../order/order.router';
import { serviceTypeRepository } from '../service-type/service-type.router';
import { staffShiftRepository } from '../staff-shift/staff-shift.router';
import { vehicleRepository } from '../vehicle/vehicle.router';
import { VehicleTypeRepository } from '../vehicle-type/vehicle-type.repository';
import { AdminWorkOrderController } from './admin-work-order.controller';
import { AssignmentService } from './assignment.service';
import { WasherWorkOrderController } from './washer-work-order.controller';
import { registerWorkOrderCron as registerCron } from './work-order.crons';
import { WorkOrderRepository } from './work-order.repository';
import { WorkOrderService } from './work-order.service';

// Manual DI wiring. Reuses the order/service-type/staff-shift/vehicle instances;
// User/Role/VehicleType repositories are stateless so a fresh instance is fine.
const repository = new WorkOrderRepository();
const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const vehicleTypeRepository = new VehicleTypeRepository();
const assignmentService = new AssignmentService(
  repository,
  staffShiftRepository,
);
const service = new WorkOrderService(
  repository,
  orderRepository,
  orderService,
  serviceTypeRepository,
  vehicleRepository,
  vehicleTypeRepository,
  staffShiftRepository,
  userRepository,
  roleRepository,
  assignmentService,
);
const adminController = new AdminWorkOrderController(service);
const washerController = new WasherWorkOrderController(service);

// Admin router — mounted at /admin/work-orders (CASHIER/MANAGER/ADMIN).
// `/queue` MUST be registered before `/:id`.
export const adminWorkOrderRouter = Router();
adminWorkOrderRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.CASHIER, RoleEnum.MANAGER, RoleEnum.ADMIN),
);
adminWorkOrderRouter.post(
  '/',
  validateDto(CreateWorkOrderDto),
  asyncHandler(adminController.create),
);
adminWorkOrderRouter.get(
  '/',
  validateDto(QueryWorkOrderDto, 'query'),
  asyncHandler(adminController.list),
);
adminWorkOrderRouter.get('/queue', asyncHandler(adminController.queue));
adminWorkOrderRouter.get('/:id', asyncHandler(adminController.getOne));
adminWorkOrderRouter.patch(
  '/:id/assign',
  validateDto(AssignWasherDto),
  asyncHandler(adminController.assign),
);
adminWorkOrderRouter.patch(
  '/:id/qc',
  validateDto(QcWorkOrderDto),
  asyncHandler(adminController.qc),
);

// Washer router — mounted at /me/work-orders (WASHER).
export const washerWorkOrderRouter = Router();
washerWorkOrderRouter.use(authMiddleware, roleMiddleware(RoleEnum.WASHER));
washerWorkOrderRouter.get('/', asyncHandler(washerController.list));
washerWorkOrderRouter.get('/:id', asyncHandler(washerController.getOne));
washerWorkOrderRouter.patch('/:id/start', asyncHandler(washerController.start));
washerWorkOrderRouter.patch(
  '/:id/finish',
  validateDto(FinishWorkOrderDto),
  asyncHandler(washerController.finish),
);

// Replaces QueueDrainCron (@nestjs/schedule) — registered from server bootstrap.
export function registerWorkOrderCron(): void {
  registerCron(assignmentService);
}

export const workOrderService = service;

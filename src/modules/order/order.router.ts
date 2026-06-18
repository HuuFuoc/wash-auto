import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { CancelOrderDto } from '../../features/order/dto/cancel-order.dto';
import { CreateOrderDto } from '../../features/order/dto/create-order.dto';
import { GetWasherScheduleQueryDto } from '../../features/order/dto/get-washer-schedule-query.dto';
import { PreviewOrderDto } from '../../features/order/dto/preview-order.dto';
import { QueryAvailableSlotsDto } from '../../features/order/dto/query-available-slots.dto';
import { QueryOrderDto } from '../../features/order/dto/query-order.dto';
import { RescheduleOrderDto } from '../../features/order/dto/reschedule-order.dto';
import { UpdateOrderStatusDto } from '../../features/order/dto/update-order-status.dto';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { idempotencyMiddleware } from '../../middlewares/idempotency.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { UserRepository } from '../auth/user.repository';
import { getEmailService } from '../email/email.service';
import { goldenHourService } from '../golden-hour/golden-hour.router';
import { loyaltyService } from '../loyalty/loyalty.router';
import { pricingPolicyService } from '../pricing-policy/pricing-policy.router';
import {
  serviceTypeRepository,
} from '../service-type/service-type.router';
import { staffShiftRepository } from '../staff-shift/staff-shift.router';
import { tierConfigRepository } from '../tier-config/tier-config.router';
import { vehicleRepository, vehicleService } from '../vehicle/vehicle.router';
import { voucherService } from '../voucher/voucher.router';
import {
  AdminOrderController,
} from './admin-order.controller';
import {
  OrderController,
  PaymentWebhookController,
} from './order.controller';
import { registerOrderCrons } from './order.crons';
import { OrderRepository } from './order.repository';
import { OrderService } from './order.service';
import { PaymentTransactionRepository } from './payment-transaction.repository';
import { getPayosService } from './payos.service';
import { WasherScheduleController } from './washer-schedule.controller';

// Manual DI wiring (replaces Nest's module providers). Reuses the singleton
// services from already-migrated modules; repositories are stateless.
export const orderRepository = new OrderRepository();
const transactionRepository = new PaymentTransactionRepository();
const userRepository = new UserRepository();

const service = new OrderService(
  orderRepository,
  transactionRepository,
  vehicleRepository,
  vehicleService,
  serviceTypeRepository,
  staffShiftRepository,
  userRepository,
  tierConfigRepository,
  loyaltyService,
  voucherService,
  goldenHourService,
  getPayosService(),
  getEmailService(),
  pricingPolicyService,
);

const orderController = new OrderController(service);
const webhookController = new PaymentWebhookController(service);
const adminController = new AdminOrderController(service);
const washerController = new WasherScheduleController(service);

// Customer router — mounted at /me/orders. @UseGuards(JwtAuthGuard).
// `/available-slots` MUST be registered before `/:id`.
export const meOrderRouter = Router();
meOrderRouter.use(authMiddleware);
meOrderRouter.post(
  '/',
  idempotencyMiddleware,
  validateDto(CreateOrderDto),
  asyncHandler(orderController.create),
);
meOrderRouter.get('/', asyncHandler(orderController.list));
meOrderRouter.post(
  '/preview',
  validateDto(PreviewOrderDto),
  asyncHandler(orderController.preview),
);
meOrderRouter.get(
  '/available-slots',
  validateDto(QueryAvailableSlotsDto, 'query'),
  asyncHandler(orderController.availableSlots),
);
meOrderRouter.get('/:id', asyncHandler(orderController.getOne));
meOrderRouter.patch(
  '/:id/reschedule',
  validateDto(RescheduleOrderDto),
  asyncHandler(orderController.reschedule),
);
meOrderRouter.patch(
  '/:id/cancel',
  validateDto(CancelOrderDto),
  asyncHandler(orderController.cancel),
);

// Public PayOS webhook — mounted at /payments. No auth.
export const paymentWebhookRouter = Router();
paymentWebhookRouter.post('/webhook', asyncHandler(webhookController.webhook));

// Admin router — mounted at /admin/orders. @Roles(CASHIER, MANAGER, ADMIN).
export const adminOrderRouter = Router();
adminOrderRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.CASHIER, RoleEnum.MANAGER, RoleEnum.ADMIN),
);
adminOrderRouter.get(
  '/',
  validateDto(QueryOrderDto, 'query'),
  asyncHandler(adminController.list),
);
adminOrderRouter.get('/:id', asyncHandler(adminController.getOne));
adminOrderRouter.patch(
  '/:id/status',
  validateDto(UpdateOrderStatusDto),
  asyncHandler(adminController.updateStatus),
);
adminOrderRouter.post('/:id/mark-paid', asyncHandler(adminController.markCashPaid));

// Washer router — mounted at /washers/me. @Roles(WASHER).
export const washerScheduleRouter = Router();
washerScheduleRouter.use(authMiddleware, roleMiddleware(RoleEnum.WASHER));
washerScheduleRouter.get(
  '/schedule',
  validateDto(GetWasherScheduleQueryDto, 'query'),
  asyncHandler(washerController.getSchedule),
);

// Shared instance so work-order/chat/dashboard reuse it once migrated
// (orderRepository is exported at its declaration above).
export const orderService = service;

// Registered from the server bootstrap (replaces OrderExpiryCron + CashNoShowCron).
export function registerOrderCron(): void {
  registerOrderCrons(service);
}

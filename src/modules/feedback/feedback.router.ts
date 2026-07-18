import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { CreateFeedbackDto } from '../../shared/feedback/dto/create-feedback.dto';
import { QueryFeedbackDto } from '../../shared/feedback/dto/query-feedback.dto';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { orderRepository } from '../order/order.router';
import { WorkOrderRepository } from '../work-order/work-order.repository';
import { AdminFeedbackController } from './admin-feedback.controller';
import { FeedbackController } from './feedback.controller';
import { FeedbackRepository } from './feedback.repository';
import { FeedbackService } from './feedback.service';
import { WasherFeedbackController } from './washer-feedback.controller';

// Manual DI wiring. Reuses the order module's repository instance; the
// work-order repository is stateless so a fresh instance is fine.
const repository = new FeedbackRepository();
const workOrderRepository = new WorkOrderRepository();
const service = new FeedbackService(
  repository,
  orderRepository,
  workOrderRepository,
);
const customerController = new FeedbackController(service);
const adminController = new AdminFeedbackController(service);
const washerController = new WasherFeedbackController(service);

// Customer router — mounted at /me/feedback (CUSTOMER).
export const meFeedbackRouter = Router();
meFeedbackRouter.use(authMiddleware, roleMiddleware(RoleEnum.CUSTOMER));
meFeedbackRouter.post(
  '/',
  validateDto(CreateFeedbackDto),
  asyncHandler(customerController.submit),
);
meFeedbackRouter.get('/', asyncHandler(customerController.list));
meFeedbackRouter.get('/:orderId', asyncHandler(customerController.getForOrder));

// Washer router — mounted at /me/washer-feedback (WASHER). Self-view only:
// the service always scopes queries to the caller's washer id.
export const washerFeedbackRouter = Router();
washerFeedbackRouter.use(authMiddleware, roleMiddleware(RoleEnum.WASHER));
washerFeedbackRouter.get(
  '/',
  validateDto(QueryFeedbackDto, 'query'),
  asyncHandler(washerController.list),
);
washerFeedbackRouter.get('/summary', asyncHandler(washerController.summary));

// Admin/Manager router — mounted at /admin/feedback (MANAGER/ADMIN).
export const adminFeedbackRouter = Router();
adminFeedbackRouter.use(
  authMiddleware,
  roleMiddleware(RoleEnum.MANAGER, RoleEnum.ADMIN),
);
adminFeedbackRouter.get(
  '/',
  validateDto(QueryFeedbackDto, 'query'),
  asyncHandler(adminController.list),
);
adminFeedbackRouter.get(
  '/washers/:washerId/summary',
  asyncHandler(adminController.washerSummary),
);

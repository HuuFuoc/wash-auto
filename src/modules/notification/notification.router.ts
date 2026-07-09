import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

// Manual DI wiring (repositories đều stateless).
const repository = new NotificationRepository();
const userRepository = new UserRepository();
const roleRepository = new RoleRepository();

// Singleton chia sẻ để order/work-order/feedback gọi notifyUser/notifyRoles.
export const notificationService = new NotificationService(
  repository,
  userRepository,
  roleRepository,
);

const controller = new NotificationController(notificationService);

// Mounted at /me/notifications — mọi user đã đăng nhập (không giới hạn vai trò).
export const meNotificationRouter = Router();
meNotificationRouter.use(authMiddleware);
meNotificationRouter.get('/', asyncHandler(controller.list));
meNotificationRouter.get('/unread-count', asyncHandler(controller.unreadCount));
meNotificationRouter.patch('/read-all', asyncHandler(controller.markAllRead));
meNotificationRouter.patch('/:id/read', asyncHandler(controller.markRead));

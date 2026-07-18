import 'reflect-metadata';
import express, { Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { config } from './config';
import { errorMiddleware } from './middlewares/error.middleware';
import { notFoundHandler } from './middlewares/not-found.middleware';
import { mountSwagger } from './docs/swagger';
import {
  chatRateLimiter,
  globalRateLimiter,
} from './middlewares/rate-limit.middleware';
// Module routers (Phase 4) — added as each module is migrated.
import { authRouter } from './modules/auth/auth.router';
import {
  adminChatKnowledgeRouter,
  chatRouter,
} from './modules/chat/chat.router';
import { adminDashboardRouter } from './modules/dashboard/dashboard.router';
import {
  adminFeedbackRouter,
  meFeedbackRouter,
  washerFeedbackRouter,
} from './modules/feedback/feedback.router';
import { adminGoldenHourRouter } from './modules/golden-hour/golden-hour.router';
import { meLoyaltyRouter } from './modules/loyalty/loyalty.router';
import { meNotificationRouter } from './modules/notification/notification.router';
import {
  adminOrderRouter,
  meOrderRouter,
  paymentWebhookRouter,
  washerScheduleRouter,
} from './modules/order/order.router';
import { adminPricingPolicyRouter } from './modules/pricing-policy/pricing-policy.router';
import {
  adminServiceTypeRouter,
  serviceTypeRouter,
} from './modules/service-type/service-type.router';
import {
  adminShiftRouter,
  shiftRouter,
} from './modules/staff-shift/staff-shift.router';
import { adminUserRouter, meUserRouter } from './modules/user/user.router';
import {
  adminTierConfigRouter,
  tierConfigRouter,
} from './modules/tier-config/tier-config.router';
import { uploadRouter } from './modules/upload/upload.router';
import {
  adminVoucherRouter,
  meVoucherRouter,
} from './modules/voucher/voucher.router';
import {
  adminVehicleRouter,
  meVehicleRouter,
} from './modules/vehicle/vehicle.router';
import {
  adminVehicleTypeRouter,
  vehicleTypeRouter,
} from './modules/vehicle-type/vehicle-type.router';
import {
  adminWorkOrderRouter,
  customerWorkOrderRouter,
  washerWorkOrderRouter,
} from './modules/work-order/work-order.router';

export function createApp() {
  const app = express();

  app.use(helmet());
  // CORS options mirror main.ts / serverless.ts exactly so the frontend keeps
  // working unchanged (Idempotency-Key in, Idempotent-Replayed out).
  app.use(
    cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
      exposedHeaders: ['Idempotent-Replayed'],
    }),
  );
  app.use(express.json());
  app.use(morgan('dev'));

  // All routes live under the global prefix (default `api`) to match Nest's
  // app.setGlobalPrefix(...). Module routers attach to this router in Phase 4.
  const apiRouter = Router();
  // Global rate-limit (= Nest global ThrottlerGuard 60/60s/IP). Mounted first
  // so it applies to every /api route, mirroring the APP_GUARD.
  apiRouter.use(globalRateLimiter);
  apiRouter.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Public routes
  apiRouter.use('/auth', authRouter);
  apiRouter.use('/vehicle-types', vehicleTypeRouter);
  apiRouter.use('/service-types', serviceTypeRouter);
  apiRouter.use('/tier-configs', tierConfigRouter);
  apiRouter.use('/upload', uploadRouter);
  apiRouter.use('/payments', paymentWebhookRouter); // PayOS webhook (no auth)
  // Chat: stricter limiter (= Nest @Throttle 20/60s) on top of the global one.
  apiRouter.use('/chat', chatRateLimiter, chatRouter); // optional auth inside

  // Authenticated routes
  apiRouter.use('/me/vehicles', meVehicleRouter);
  apiRouter.use('/me/vouchers', meVoucherRouter);
  apiRouter.use('/me/loyalty', meLoyaltyRouter);
  apiRouter.use('/me/orders', meOrderRouter);
  apiRouter.use('/me/work-orders', washerWorkOrderRouter);
  apiRouter.use('/me/orders', customerWorkOrderRouter);
  apiRouter.use('/me/feedback', meFeedbackRouter);
  apiRouter.use('/me/washer-feedback', washerFeedbackRouter);
  apiRouter.use('/me/profile', meUserRouter);
  apiRouter.use('/me/notifications', meNotificationRouter);
  apiRouter.use('/shifts', shiftRouter);
  apiRouter.use('/washers/me', washerScheduleRouter);

  // Admin routes (guards applied inside each router)
  apiRouter.use('/admin/vehicle-types', adminVehicleTypeRouter);
  apiRouter.use('/admin/service-types', adminServiceTypeRouter);
  apiRouter.use('/admin/golden-hours', adminGoldenHourRouter);
  apiRouter.use('/admin/pricing-policy', adminPricingPolicyRouter);
  apiRouter.use('/admin/tier-configs', adminTierConfigRouter);
  apiRouter.use('/admin/vehicles', adminVehicleRouter);
  apiRouter.use('/admin/vouchers', adminVoucherRouter);
  apiRouter.use('/admin/shifts', adminShiftRouter);
  apiRouter.use('/admin/users', adminUserRouter);
  apiRouter.use('/admin/orders', adminOrderRouter);
  apiRouter.use('/admin/work-orders', adminWorkOrderRouter);
  apiRouter.use('/admin/chat-knowledge', adminChatKnowledgeRouter);
  apiRouter.use('/admin/dashboard', adminDashboardRouter);
  apiRouter.use('/admin/feedback', adminFeedbackRouter);

  app.use(`/${config.app.globalPrefix}`, apiRouter);

  // API docs (Swagger UI + raw spec). Public, all envs. Before the 404 handler.
  mountSwagger(app);

  // Catch-all 404 (= Nest unmatched-route NotFoundException JSON). After all
  // routers, before the error middleware. Service-thrown NotFoundException is
  // unaffected (it flows through errorMiddleware as before).
  app.use(notFoundHandler);

  app.use(errorMiddleware); // PHẢI đặt CUỐI CÙNG, sau tất cả router
  return app;
}

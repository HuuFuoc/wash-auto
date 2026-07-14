import * as dns from 'dns';
import { createServer } from 'http';
import { createApp } from './app';
import { connectDB } from './config/database';
import { config } from './config';
import { initRealtime } from './core/realtime';
import { seedAuthRoles } from './modules/auth/auth.router';
import { seedChatKnowledge } from './modules/chat/chat.router';
import { seedGoldenHourDefaults } from './modules/golden-hour/golden-hour.router';
import { registerLoyaltyCron } from './modules/loyalty/loyalty.router';
import { registerOrderCron } from './modules/order/order.router';
import { seedPricingPolicyDefaults } from './modules/pricing-policy/pricing-policy.router';
import { seedTierConfigDefaults } from './modules/tier-config/tier-config.router';
import { registerVoucherCron } from './modules/voucher/voucher.router';
import { registerWorkOrderCron } from './modules/work-order/work-order.router';

// Local dev workaround for Vietnamese ISPs that block Mongo Atlas DNS — kept
// identical to main.ts; never override resolvers in production.
if (config.app.nodeEnv !== 'production') {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
}

// Replaces the per-module onModuleInit seeding (roles, golden-hour,
// pricing-policy, tier-config). Runs once after the DB connects.
async function seedDefaults(): Promise<void> {
  await seedAuthRoles();
  await seedTierConfigDefaults();
  await seedGoldenHourDefaults();
  await seedPricingPolicyDefaults();
  await seedChatKnowledge();
}

// Replaces @nestjs/schedule @Cron jobs (voucher expiry, loyalty annual reset).
function registerCrons(): void {
  registerVoucherCron();
  registerLoyaltyCron();
  registerOrderCron();
  registerWorkOrderCron();
}

async function bootstrap(): Promise<void> {
  await connectDB();
  await seedDefaults();
  registerCrons();
  const app = createApp();
  const httpServer = createServer(app);
  // Sync: Socket.IO (and its Redis adapter) must be attached BEFORE we listen,
  // so the very first upgrade request already has a handler.
  initRealtime(httpServer);
  httpServer.listen(config.app.port, () => {
    console.log(
      `🚀 Server on http://localhost:${config.app.port}/${config.app.globalPrefix} (realtime enabled)`,
    );
  });
}

// NOTE: no SIGTERM/SIGINT shutdown hook on purpose. `closeRealtime()` (exported
// from core/realtime) quits the Redis pub/sub clients, but a hook that calls it
// and then process.exit() aborts on Windows (libuv: "Assertion failed:
// !(handle->flags & UV_HANDLE_CLOSING)" — verified), while a hook WITHOUT
// process.exit() hangs, because Mongo, the shared Redis client and the node-cron
// jobs all keep the event loop alive. A correct graceful shutdown means draining
// all four, which is out of scope here. The OS reclaims the connections on exit.

void bootstrap();

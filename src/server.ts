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
  initRealtime(httpServer);
  httpServer.listen(config.app.port, () => {
    console.log(
      `🚀 Server on http://localhost:${config.app.port}/${config.app.globalPrefix} (realtime enabled)`,
    );
  });
}

void bootstrap();

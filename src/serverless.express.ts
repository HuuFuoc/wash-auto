import 'reflect-metadata';
import * as dns from 'dns';
import type { Request, Response } from 'express';
import { createApp } from './app';
import { connectDB } from './config/database';
import { config } from './config';
import { seedAuthRoles } from './modules/auth/auth.router';
import { seedChatKnowledge } from './modules/chat/chat.router';
import { seedGoldenHourDefaults } from './modules/golden-hour/golden-hour.router';
import { seedPricingPolicyDefaults } from './modules/pricing-policy/pricing-policy.router';
import { seedTierConfigDefaults } from './modules/tier-config/tier-config.router';

// Express serverless entrypoint for Vercel — the mirror of the Nest
// serverless.ts. Additive: server.ts (local `app.listen`) and serverless.ts
// (Nest, current prod entrypoint) are untouched. vercel.json still points at
// serverless.ts; this file is wired only via vercel.preview.json.
//
// Differences from server.ts ON PURPOSE:
//   - NO app.listen (Vercel invokes the exported handler per request).
//   - NO registerCrons: node-cron timers cannot run on serverless (the instance
//     freezes between requests). Crons stay dormant here, matching how the Nest
//     app behaves on Vercel today. Scheduling is out of scope this round.

// Local dev workaround for Vietnamese ISPs that block Mongo Atlas DNS — kept
// identical to server.ts / main.ts; never override resolvers in production
// (Vercel sets NODE_ENV=production, so this is a no-op there).
if (config.app.nodeEnv !== 'production') {
  dns.setServers(['8.8.8.8', '8.8.4.4']);
}

// createApp() is pure (no I/O) and is cached at module scope so a warm Vercel
// instance builds the Express app exactly once and reuses it across requests.
const app = createApp();

// Bootstrap = connect Mongo + seed defaults, run EXACTLY ONCE per warm instance.
// Caching the promise (not awaiting per request) is what keeps us from opening a
// new Mongo connection / re-seeding on every invocation, which would exhaust the
// Atlas connection pool. Mirrors the bootstrapPromise pattern in serverless.ts.
let bootstrapPromise: Promise<void> | null = null;

async function bootstrap(): Promise<void> {
  await connectDB();
  await seedDefaults();
}

// Replaces the per-module onModuleInit seeding (roles, golden-hour,
// pricing-policy, tier-config, chat-knowledge). Identical to server.ts.
async function seedDefaults(): Promise<void> {
  await seedAuthRoles();
  await seedTierConfigDefaults();
  await seedGoldenHourDefaults();
  await seedPricingPolicyDefaults();
  await seedChatKnowledge();
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap();
  }
  await bootstrapPromise;
  app(req, res);
}

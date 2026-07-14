import 'reflect-metadata';
import * as dns from 'dns';
import { createServer } from 'http';
import { createApp } from './app';
import { connectDB } from './config/database';
import { config } from './config';
import { initRealtime } from './core/realtime';
import { seedAuthRoles } from './modules/auth/auth.router';
import { seedChatKnowledge } from './modules/chat/chat.router';
import { seedGoldenHourDefaults } from './modules/golden-hour/golden-hour.router';
import { seedPricingPolicyDefaults } from './modules/pricing-policy/pricing-policy.router';
import { seedTierConfigDefaults } from './modules/tier-config/tier-config.router';

// Express serverless entrypoint for Vercel (wired via vercel.json).
//
// Differences from server.ts ON PURPOSE:
//   - NO server.listen: Vercel owns the socket. We export the http.Server and
//     the runtime feeds it requests AND WebSocket upgrades.
//   - NO registerCrons: node-cron timers cannot run on serverless (the instance
//     freezes between requests). Scheduling is out of scope this round.
//
// Realtime on Vercel: exporting an http.Server (not a (req, res) handler) is
// what allows WebSocket upgrades to reach Socket.IO — see
// https://vercel.com/docs/functions/websockets. Requires Fluid compute to be
// enabled on the Vercel project.
//
// A connection is pinned to one warm instance, so an emit fired during a REST
// request would only reach sockets held by that SAME instance. initRealtime()
// now attaches the Socket.IO Redis adapter (core/realtime-adapter.ts) when
// REDIS_URL is set, which fans emits out across instances over Pub/Sub. It stays
// SYNCHRONOUS (ioredis queues commands until connected), so we can still export
// the http.Server at module scope without awaiting anything — do not make this
// async, it would break the WebSocket upgrade path.

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
// Atlas connection pool.
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

// HTTP requests still gate on the one-time bootstrap before hitting Express.
// Socket.IO handshakes bypass this on purpose: initRealtime() intercepts
// /socket.io/* at the server level and only verifies a JWT — no DB needed.
const server = createServer((req, res) => {
  if (!bootstrapPromise) {
    bootstrapPromise = bootstrap();
  }
  bootstrapPromise.then(
    () => {
      app(req, res);
    },
    (err: unknown) => {
      console.error('Bootstrap failed:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    },
  );
});

initRealtime(server);

export default server;

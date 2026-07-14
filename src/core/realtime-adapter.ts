import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { Server } from 'socket.io';
import { config } from '../config';

/**
 * Socket.IO Redis adapter — makes emits cross instance boundaries.
 *
 * Why this exists: Socket.IO keeps its socket/room registry in the process
 * memory. On Vercel (Fluid compute) a REST request can be served by instance B
 * while a client's socket is held by instance A, so `emitToUser()` fired during
 * that request reaches nobody. The Redis adapter publishes every emit over
 * Redis Pub/Sub so all instances fan it out to their own sockets.
 *
 * Two deliberate choices:
 *
 *  1. We do NOT reuse `core/redis.ts`'s shared client. A Redis connection in
 *     subscriber mode cannot run normal commands, so the adapter needs its own
 *     pair — and that shared client connects eagerly at import time, which would
 *     open a socket just by importing the realtime module (bad for tests).
 *
 *  2. Clients are created INSIDE this function, never at module scope, and no
 *     `await` is needed: ioredis buffers commands until the connection is ready
 *     (offline queue), so the adapter's SUBSCRIBE is queued and `initRealtime()`
 *     stays synchronous. That is what lets `serverless.express.ts` keep
 *     exporting the `http.Server` synchronously, preserving WebSocket upgrades.
 *
 * Exactly one pub/sub pair per server process.
 */
let pubClient: Redis | null = null;
let subClient: Redis | null = null;

/**
 * Attaches the Redis adapter to `io` when configured. Returns whether it was
 * attached. Never throws on a missing REDIS_URL unless SOCKET_REDIS_REQUIRED.
 */
export function attachRedisAdapter(io: Server): boolean {
  // Idempotent: a second call (e.g. a warm serverless instance re-initialising)
  // must not open another pair of connections.
  if (pubClient && subClient) return true;

  const { redisUrl } = config.cache;
  const { redisEnabled, redisRequired } = config.realtime;

  if (!redisEnabled || !redisUrl) {
    const reason = !redisUrl
      ? 'REDIS_URL is missing'
      : 'SOCKET_REDIS_ENABLED=false';
    if (redisRequired) {
      // Multi-instance production opted into strict mode: fail fast rather than
      // silently dropping cross-instance emits.
      throw new Error(
        `[realtime] Socket.IO Redis adapter is required (SOCKET_REDIS_REQUIRED=true) but ${reason}`,
      );
    }
    console.warn(
      `[realtime] Socket.IO Redis adapter disabled: ${reason} — running single-instance (emits only reach sockets on THIS instance)`,
    );
    return false;
  }

  // maxRetriesPerRequest: null — keep the adapter's commands queued during a
  // blip instead of failing them, which would silently drop an emit.
  pubClient = new Redis(redisUrl, { maxRetriesPerRequest: null });
  subClient = pubClient.duplicate();

  pubClient.on('error', (err: Error) =>
    console.error('[realtime] Redis pub client error:', err.message),
  );
  subClient.on('error', (err: Error) =>
    console.error('[realtime] Redis sub client error:', err.message),
  );
  subClient.once('ready', () =>
    console.log('[realtime] Socket.IO Redis adapter ready (multi-instance)'),
  );

  io.adapter(createAdapter(pubClient, subClient));
  console.log('[realtime] Socket.IO Redis adapter attached');
  return true;
}

/** Closes the pub/sub pair. Safe to call when the adapter was never attached. */
export async function closeRedisAdapter(): Promise<void> {
  const clients = [pubClient, subClient].filter(
    (client): client is Redis => client !== null,
  );
  pubClient = null;
  subClient = null;
  await Promise.all(clients.map((client) => client.quit()));
}

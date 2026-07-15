import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { DefaultEventsMap, Server, Socket } from 'socket.io';
import { config } from '../config';
import { RoleEnum } from '../shared/auth/types/role.enum';
import { IAuthPayload } from '../shared/types/auth-payload.type';
import { attachRedisAdapter, closeRedisAdapter } from './realtime-adapter';

/**
 * The access-token payload of an authenticated socket: what auth.service signs
 * ({ sub, email, role }) plus the standard JWT claims we rely on.
 */
export interface RealtimeUser extends IAuthPayload {
  exp?: number;
  iat?: number;
}

/** Per-socket state we attach after authenticating the handshake token. */
interface SocketData {
  user?: RealtimeUser;
  /** Fires when the access token expires — cleared on disconnect. */
  expiryTimer?: NodeJS.Timeout;
}

type AppServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

type AppSocket = Socket<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

/**
 * Realtime layer (Socket.IO). A single server instance is shared across the
 * app. Services emit through the helpers below; when no server is initialised
 * (tests) every emit is a safe no-op, so callers never branch.
 *
 * The realtime layer is ONE-WAY: server → client. There is deliberately no
 * client → server business event — every action goes through the REST API, and
 * REST stays the source of truth a client re-syncs against after being offline.
 *
 * Rooms (derived from the VERIFIED token only — a client can never pick one):
 *   - `user:{userId}`  — a single authenticated user (all their devices).
 *   - `role:{role}`    — everyone with that role (managers' dashboard feed).
 */
let io: AppServer | null = null;

/** Realtime event names shared by web + mobile clients. */
export const RealtimeEvent = {
  ORDER_CREATED: 'order:created',
  ORDER_STATUS: 'order:status',
  WASH_ASSIGNED: 'wash:assigned',
  WASH_STARTED: 'wash:started',
  WASH_COMPLETED: 'wash:completed',
  FEEDBACK_CREATED: 'feedback:created',
  /** Một thông báo (đã lưu DB) vừa được tạo cho người dùng. */
  NOTIFICATION_NEW: 'notification:new',
  /** Handshake token đã hết hạn khi socket đang mở → client refresh + reconnect. */
  AUTH_ERROR: 'auth:error',
  /** Slot đặt lịch của một ngày vừa thay đổi (đơn tạo/hủy/dời/no-show). */
  SLOTS_CHANGED: 'slots:changed',
} as const;

/** Machine-readable auth failures. The client branches on `code`, not on text. */
export const RealtimeErrorCode = {
  AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',
  AUTH_USER_INVALID: 'AUTH_USER_INVALID',
} as const;

export type RealtimeErrorCode =
  (typeof RealtimeErrorCode)[keyof typeof RealtimeErrorCode];

/**
 * Socket.IO ships `err.data` to the client's `connect_error` handler, which is
 * the only channel a rejected handshake has. Message stays generic — never a
 * stack trace, never anything about the secret.
 */
interface RealtimeAuthError extends Error {
  data?: { code: RealtimeErrorCode; message: string };
}

function authError(
  code: RealtimeErrorCode,
  message: string,
): RealtimeAuthError {
  const error: RealtimeAuthError = new Error('Authentication failed');
  error.data = { code, message };
  return error;
}

const KNOWN_ROLES = new Set<string>(Object.values(RoleEnum));

/** setTimeout silently fires immediately past this — guard instead. */
const MAX_TIMEOUT_MS = 2_147_483_647;

export const userRoom = (userId: string): string => `user:${userId}`;
export const roleRoom = (role: string): string => `role:${role}`;

/**
 * Handshake token, in priority order:
 *   1. `handshake.auth.token`            — what web + mobile should use.
 *   2. `Authorization: Bearer <token>`   — native clients that set headers.
 *
 * Query params are intentionally NOT supported: they leak the token into logs
 * and proxy access logs, and no current client sends one.
 */
export function extractSocketToken(socket: AppSocket): string | null {
  const fromAuth: unknown = socket.handshake.auth?.token;
  if (typeof fromAuth === 'string' && fromAuth.trim() !== '') {
    return fromAuth.trim();
  }

  const header: unknown = socket.handshake.headers.authorization;
  if (typeof header === 'string') {
    const [scheme, value] = header.trim().split(/\s+/);
    if (scheme?.toLowerCase() === 'bearer' && value) return value;
  }

  return null;
}

/**
 * Verifies the token and the claims we actually depend on. Throws a
 * RealtimeAuthError carrying one of the four codes — never leaks jwt internals.
 */
function verifySocketUser(token: string): RealtimeUser {
  let payload: string | jwt.JwtPayload;
  try {
    payload = jwt.verify(token, config.auth.accessSecret);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw authError(
        RealtimeErrorCode.AUTH_TOKEN_EXPIRED,
        'Access token has expired',
      );
    }
    // Malformed / bad signature / wrong secret — all indistinguishable to the
    // client on purpose.
    throw authError(
      RealtimeErrorCode.AUTH_TOKEN_INVALID,
      'Access token is invalid',
    );
  }

  if (typeof payload === 'string') {
    throw authError(
      RealtimeErrorCode.AUTH_USER_INVALID,
      'Access token payload is invalid',
    );
  }

  const user = payload as RealtimeUser;
  if (typeof user.sub !== 'string' || user.sub.trim() === '') {
    // Without a trustworthy `sub` there is no room to join — refuse rather than
    // connect a socket that can never receive anything.
    throw authError(
      RealtimeErrorCode.AUTH_USER_INVALID,
      'Access token payload is missing a valid subject',
    );
  }

  return user;
}

/**
 * Handshake auth. A token that is present but bad is ALWAYS rejected — the old
 * behaviour (fall through to an anonymous socket) left mobile clients silently
 * connected but deaf after their 15-minute token expired.
 */
export function socketAuthMiddleware(
  socket: AppSocket,
  next: (err?: Error) => void,
): void {
  const token = extractSocketToken(socket);

  if (!token) {
    if (config.realtime.allowAnonymous) {
      next();
      return;
    }
    console.warn(
      `[realtime] handshake rejected socketId=${socket.id} code=${RealtimeErrorCode.AUTH_TOKEN_MISSING}`,
    );
    next(
      authError(
        RealtimeErrorCode.AUTH_TOKEN_MISSING,
        'Access token is required',
      ),
    );
    return;
  }

  try {
    socket.data.user = verifySocketUser(token);
    next();
  } catch (err) {
    const error = err as RealtimeAuthError;
    console.warn(
      `[realtime] handshake rejected socketId=${socket.id} code=${
        error.data?.code ?? RealtimeErrorCode.AUTH_TOKEN_INVALID
      }`,
    );
    next(error);
  }
}

/** Tells the client its token died, then drops the socket. */
function disconnectExpired(socket: AppSocket): void {
  const userId = socket.data.user?.sub;
  console.log(
    `[realtime] token expired mid-connection socketId=${socket.id} userId=${
      userId ?? '-'
    } code=${RealtimeErrorCode.AUTH_TOKEN_EXPIRED}`,
  );
  socket.emit(RealtimeEvent.AUTH_ERROR, {
    code: RealtimeErrorCode.AUTH_TOKEN_EXPIRED,
    message: 'Access token has expired',
  });
  // engine.io flushes the write buffer before closing, so the event above still
  // reaches the client.
  socket.disconnect(true);
}

/**
 * The handshake only proves the token was valid AT CONNECT TIME. With a ~15m
 * access TTL, a mobile socket would otherwise stay in its rooms for hours on a
 * dead token. We never refresh server-side — the client refreshes over REST and
 * reconnects.
 */
function scheduleTokenExpiry(socket: AppSocket, user: RealtimeUser): void {
  if (typeof user.exp !== 'number' || !Number.isFinite(user.exp)) return;

  const delay = user.exp * 1000 - Date.now();
  if (delay <= 0) {
    disconnectExpired(socket);
    return;
  }
  // A token outliving the max timer would fire immediately — leave it alone
  // rather than kicking a socket whose token is still perfectly valid.
  if (delay > MAX_TIMEOUT_MS) return;

  const timer = setTimeout(() => disconnectExpired(socket), delay);
  // Don't hold the event loop open just to kick a socket.
  timer.unref?.();
  socket.data.expiryTimer = timer;
}

/**
 * Runs on every (re)connection, so a mobile client that reconnects lands back
 * in its rooms with no `join-room` event and no client-supplied identity.
 */
export function handleConnection(socket: AppSocket): void {
  const user = socket.data.user;

  if (!user) {
    // Only reachable with SOCKET_ALLOW_ANONYMOUS=true.
    console.log(`[realtime] anonymous socket connected socketId=${socket.id}`);
    return;
  }

  void socket.join(userRoom(user.sub));

  if (KNOWN_ROLES.has(user.role)) {
    void socket.join(roleRoom(user.role));
  } else {
    // Unknown/missing role: still a valid user, just no role feed.
    console.warn(
      `[realtime] unknown role, skipping role room socketId=${socket.id} userId=${user.sub}`,
    );
  }

  console.log(
    `[realtime] connected socketId=${socket.id} userId=${user.sub} role=${user.role}`,
  );

  scheduleTokenExpiry(socket, user);

  socket.on('disconnect', (reason: string) => {
    if (socket.data.expiryTimer) {
      clearTimeout(socket.data.expiryTimer);
      socket.data.expiryTimer = undefined;
    }
    console.log(
      `[realtime] disconnected socketId=${socket.id} userId=${user.sub} reason=${reason}`,
    );
  });
}

/**
 * Synchronous on purpose: the Socket.IO server must be attached to the
 * http.Server before it starts taking upgrades, and `serverless.express.ts`
 * exports that http.Server at module scope with no chance to await. The Redis
 * adapter needs no await either (see realtime-adapter.ts).
 */
export function initRealtime(httpServer: HttpServer): AppServer {
  io = new Server<
    DefaultEventsMap,
    DefaultEventsMap,
    DefaultEventsMap,
    SocketData
  >(httpServer, {
    // Unchanged: reflects the request origin. Native mobile sends no Origin, so
    // it is unaffected either way.
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  attachRedisAdapter(io);

  io.use(socketAuthMiddleware);
  io.on('connection', handleConnection);

  return io;
}

/** Shuts the realtime layer down (also closes the attached http.Server). */
export async function closeRealtime(): Promise<void> {
  const server = io;
  io = null;
  if (server) {
    await new Promise<void>((resolve) => {
      void server.close(() => resolve());
    });
  }
  await closeRedisAdapter();
}

/** Emit to one user's personal room (their devices: web + mobile). */
export function emitToUser(
  userId: string,
  event: string,
  payload: unknown,
): void {
  io?.to(userRoom(userId)).emit(event, payload);
}

/** Emit to the manager/admin operational feed (dashboard + ops tabs). */
export function emitToManagers(event: string, payload: unknown): void {
  io?.to(roleRoom(RoleEnum.MANAGER))
    .to(roleRoom(RoleEnum.ADMIN))
    .emit(event, payload);
}

/** Emit to the operational feed including cashier (POS screens). */
export function emitToOps(event: string, payload: unknown): void {
  io?.to(roleRoom(RoleEnum.MANAGER))
    .to(roleRoom(RoleEnum.ADMIN))
    .to(roleRoom(RoleEnum.CASHIER))
    .emit(event, payload);
}

/** Emit to every connected customer (slot-availability broadcasts). */
export function emitToCustomers(event: string, payload: unknown): void {
  io?.to(roleRoom(RoleEnum.CUSTOMER)).emit(event, payload);
}

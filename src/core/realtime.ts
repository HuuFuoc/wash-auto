import { Server as HttpServer } from 'http';
import jwt from 'jsonwebtoken';
import { DefaultEventsMap, Server } from 'socket.io';
import { config } from '../config';
import { RoleEnum } from '../shared/auth/types/role.enum';
import { IAuthPayload } from '../shared/types/auth-payload.type';

/** Per-socket state we attach after authenticating the handshake token. */
interface SocketData {
  user?: IAuthPayload;
}

type AppServer = Server<
  DefaultEventsMap,
  DefaultEventsMap,
  DefaultEventsMap,
  SocketData
>;

/**
 * Realtime layer (Socket.IO). A single server instance is shared across the
 * app. Services emit through the helpers below; when no server is initialised
 * (serverless / tests) every emit is a safe no-op, so callers never branch.
 *
 * Rooms:
 *   - `user:{userId}`  — a single authenticated user (their orders/washes).
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
} as const;

export function initRealtime(httpServer: HttpServer): AppServer {
  io = new Server<
    DefaultEventsMap,
    DefaultEventsMap,
    DefaultEventsMap,
    SocketData
  >(httpServer, {
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  // Optional JWT auth: a token (handshake.auth.token or Authorization header)
  // identifies the user so we can place them in their personal + role rooms.
  // Anonymous sockets connect but only receive broadcasts they explicitly join.
  io.use((socket, next) => {
    const token =
      (socket.handshake.auth?.token as string | undefined) ??
      socket.handshake.headers.authorization?.split(' ')[1];
    if (token) {
      try {
        socket.data.user = jwt.verify(
          token,
          config.auth.accessSecret,
        ) as IAuthPayload;
      } catch {
        // Invalid token → treat as anonymous; do not reject the connection.
      }
    }
    next();
  });

  io.on('connection', (socket) => {
    const user = socket.data.user;
    if (user) {
      socket.join(`user:${user.sub}`);
      if (user.role) socket.join(`role:${user.role}`);
    }
  });

  return io;
}

/** Emit to one user's personal room (their devices: web + mobile). */
export function emitToUser(
  userId: string,
  event: string,
  payload: unknown,
): void {
  io?.to(`user:${userId}`).emit(event, payload);
}

/** Emit to everyone holding a given role. */
export function emitToRole(
  role: RoleEnum,
  event: string,
  payload: unknown,
): void {
  io?.to(`role:${role}`).emit(event, payload);
}

/** Emit to the manager/admin operational feed (dashboard + ops tabs). */
export function emitToManagers(event: string, payload: unknown): void {
  io?.to(`role:${RoleEnum.MANAGER}`)
    .to(`role:${RoleEnum.ADMIN}`)
    .emit(event, payload);
}

export function isRealtimeEnabled(): boolean {
  return io !== null;
}

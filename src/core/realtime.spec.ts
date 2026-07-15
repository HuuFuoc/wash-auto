import { createServer } from 'http';
import jwt from 'jsonwebtoken';
import type { Server } from 'socket.io';
import { config } from '../config';
import { RoleEnum } from '../shared/auth/types/role.enum';
import {
  RealtimeErrorCode,
  RealtimeEvent,
  closeRealtime,
  emitToCustomers,
  emitToManagers,
  emitToOps,
  emitToUser,
  extractSocketToken,
  handleConnection,
  initRealtime,
  socketAuthMiddleware,
} from './realtime';
import { attachRedisAdapter } from './realtime-adapter';

/**
 * The handshake middleware and the connection handler are exported precisely so
 * they can be driven with a fake socket — no port binding, no socket.io-client
 * dependency, no flaky network in CI.
 */
interface FakeSocket {
  id: string;
  handshake: {
    auth: Record<string, unknown>;
    headers: Record<string, unknown>;
  };
  data: { user?: unknown; expiryTimer?: NodeJS.Timeout };
  join: jest.Mock;
  emit: jest.Mock;
  disconnect: jest.Mock;
  on: jest.Mock;
}

function fakeSocket(
  handshake: Partial<FakeSocket['handshake']> = {},
): FakeSocket {
  return {
    id: 'socket-1',
    handshake: {
      auth: handshake.auth ?? {},
      headers: handshake.headers ?? {},
    },
    data: {},
    join: jest.fn(),
    emit: jest.fn(),
    disconnect: jest.fn(),
    on: jest.fn(),
  };
}

type MiddlewareSocket = Parameters<typeof socketAuthMiddleware>[0];

const asSocket = (socket: FakeSocket): MiddlewareSocket =>
  socket as unknown as MiddlewareSocket;

const USER_ID = '6601e3b3f1a2c3a4b5d6e7f8';

function signToken(
  payload: Record<string, unknown> = {},
  expiresInSeconds = 900,
): string {
  return jwt.sign(
    {
      sub: USER_ID,
      email: 'washer@example.com',
      role: RoleEnum.WASHER,
      ...payload,
    },
    config.auth.accessSecret,
    { expiresIn: expiresInSeconds },
  );
}

/** Runs the handshake middleware and returns the error it rejected with (if any). */
function runHandshake(socket: FakeSocket): Error | undefined {
  let error: Error | undefined;
  socketAuthMiddleware(asSocket(socket), (err) => {
    error = err;
  });
  return error;
}

function errorCode(err: Error | undefined): string | undefined {
  return (err as { data?: { code?: string } } | undefined)?.data?.code;
}

describe('realtime handshake authentication', () => {
  it('accepts a valid token and joins the user + role rooms from the TOKEN', () => {
    const socket = fakeSocket({ auth: { token: signToken() } });

    const err = runHandshake(socket);
    expect(err).toBeUndefined();

    handleConnection(asSocket(socket));

    expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect(socket.join).toHaveBeenCalledWith(`role:${RoleEnum.WASHER}`);
    expect(socket.join).toHaveBeenCalledTimes(2);
  });

  it('accepts the token from an Authorization: Bearer header', () => {
    const socket = fakeSocket({
      headers: { authorization: `Bearer ${signToken()}` },
    });

    expect(runHandshake(socket)).toBeUndefined();
  });

  it('rejects a missing token with AUTH_TOKEN_MISSING', () => {
    const err = runHandshake(fakeSocket());

    expect(err).toBeInstanceOf(Error);
    expect(errorCode(err)).toBe(RealtimeErrorCode.AUTH_TOKEN_MISSING);
  });

  it('rejects a malformed / wrongly-signed token with AUTH_TOKEN_INVALID', () => {
    const forged = jwt.sign(
      { sub: USER_ID, role: RoleEnum.ADMIN },
      'not-our-secret',
    );

    expect(
      errorCode(runHandshake(fakeSocket({ auth: { token: 'garbage' } }))),
    ).toBe(RealtimeErrorCode.AUTH_TOKEN_INVALID);
    expect(
      errorCode(runHandshake(fakeSocket({ auth: { token: forged } }))),
    ).toBe(RealtimeErrorCode.AUTH_TOKEN_INVALID);
  });

  it('rejects an expired token with AUTH_TOKEN_EXPIRED (never silently anonymous)', () => {
    const socket = fakeSocket({ auth: { token: signToken({}, -60) } });

    const err = runHandshake(socket);

    expect(errorCode(err)).toBe(RealtimeErrorCode.AUTH_TOKEN_EXPIRED);
    expect(socket.data.user).toBeUndefined();
  });

  it('rejects a token whose payload has no sub with AUTH_USER_INVALID', () => {
    const noSub = jwt.sign(
      { email: 'x@example.com', role: RoleEnum.CUSTOMER },
      config.auth.accessSecret,
      { expiresIn: 900 },
    );

    expect(
      errorCode(runHandshake(fakeSocket({ auth: { token: noSub } }))),
    ).toBe(RealtimeErrorCode.AUTH_USER_INVALID);
  });

  it('ignores a client-supplied userId/role and never registers a join-room event', () => {
    // A client trying to impersonate an admin on another account.
    const socket = fakeSocket({
      auth: {
        token: signToken(),
        userId: 'attacker-id',
        role: RoleEnum.ADMIN,
      },
    });

    runHandshake(socket);
    handleConnection(asSocket(socket));

    expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect(socket.join).toHaveBeenCalledWith(`role:${RoleEnum.WASHER}`);
    expect(socket.join).not.toHaveBeenCalledWith('user:attacker-id');
    expect(socket.join).not.toHaveBeenCalledWith(`role:${RoleEnum.ADMIN}`);

    // The only listener is `disconnect` — there is no client → server surface.
    const events = socket.on.mock.calls.map(([event]) => event as string);
    expect(events).toEqual(['disconnect']);
  });

  it('skips the role room when the role is not a known role', () => {
    const socket = fakeSocket({
      auth: { token: signToken({ role: 'superuser' }) },
    });

    runHandshake(socket);
    handleConnection(asSocket(socket));

    // User room still works — it comes from the verified `sub`.
    expect(socket.join).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect(socket.join).toHaveBeenCalledTimes(1);
  });
});

describe('extractSocketToken', () => {
  it('handles the edge cases without throwing', () => {
    expect(extractSocketToken(asSocket(fakeSocket()))).toBeNull();
    expect(
      extractSocketToken(asSocket(fakeSocket({ auth: { token: '' } }))),
    ).toBeNull();
    expect(
      extractSocketToken(asSocket(fakeSocket({ auth: { token: 123 } }))),
    ).toBeNull();
    expect(
      extractSocketToken(
        asSocket(fakeSocket({ headers: { authorization: 'Basic abc' } })),
      ),
    ).toBeNull();
    expect(
      extractSocketToken(
        asSocket(fakeSocket({ headers: { authorization: 'Bearer' } })),
      ),
    ).toBeNull();
    // auth.token wins over the header, and surrounding whitespace is trimmed.
    expect(
      extractSocketToken(
        asSocket(
          fakeSocket({
            auth: { token: '  tok-a  ' },
            headers: { authorization: 'Bearer tok-b' },
          }),
        ),
      ),
    ).toBe('tok-a');
    expect(
      extractSocketToken(
        asSocket(fakeSocket({ headers: { authorization: 'bearer tok-b' } })),
      ),
    ).toBe('tok-b');
  });
});

describe('token expiry while the socket is connected', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('emits auth:error then disconnects when the token expires mid-connection', () => {
    const socket = fakeSocket({ auth: { token: signToken({}, 60) } });

    runHandshake(socket);
    handleConnection(asSocket(socket));

    expect(socket.emit).not.toHaveBeenCalled();

    jest.advanceTimersByTime(60_000);

    expect(socket.emit).toHaveBeenCalledWith(RealtimeEvent.AUTH_ERROR, {
      code: RealtimeErrorCode.AUTH_TOKEN_EXPIRED,
      message: 'Access token has expired',
    });
    expect(socket.disconnect).toHaveBeenCalledWith(true);
  });

  it('clears the expiry timer when the socket disconnects first (no leak)', () => {
    const socket = fakeSocket({ auth: { token: signToken({}, 60) } });

    runHandshake(socket);
    handleConnection(asSocket(socket));
    expect(socket.data.expiryTimer).toBeDefined();

    // Fire the `disconnect` handler the connection handler registered.
    const calls = socket.on.mock.calls as [string, (reason: string) => void][];
    const onDisconnect = calls.find(([event]) => event === 'disconnect')?.[1];
    expect(onDisconnect).toBeDefined();
    onDisconnect?.('transport close');

    expect(socket.data.expiryTimer).toBeUndefined();

    jest.advanceTimersByTime(120_000);
    expect(socket.emit).not.toHaveBeenCalled();
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});

describe('emit helpers (regression — web client contract)', () => {
  let io: Server;

  beforeAll(() => {
    // No listen() — the Socket.IO server attaches to an unbound http.Server.
    io = initRealtime(createServer());
  });

  afterAll(async () => {
    await closeRealtime();
  });

  it('keeps the event names the web client already subscribes to', () => {
    expect(RealtimeEvent).toMatchObject({
      ORDER_CREATED: 'order:created',
      ORDER_STATUS: 'order:status',
      WASH_ASSIGNED: 'wash:assigned',
      WASH_STARTED: 'wash:started',
      WASH_COMPLETED: 'wash:completed',
      FEEDBACK_CREATED: 'feedback:created',
      NOTIFICATION_NEW: 'notification:new',
    });
  });

  it('emitToUser targets user:{id} with an unchanged payload', () => {
    const emit = jest.fn();
    const to = jest
      .spyOn(io, 'to')
      .mockReturnValue({ to: jest.fn(), emit } as unknown as ReturnType<
        typeof io.to
      >);

    const payload = { id: 'n1', title: 'Xe của bạn đã rửa xong' };
    emitToUser(USER_ID, RealtimeEvent.NOTIFICATION_NEW, payload);

    expect(to).toHaveBeenCalledWith(`user:${USER_ID}`);
    expect(emit).toHaveBeenCalledWith(RealtimeEvent.NOTIFICATION_NEW, payload);
    to.mockRestore();
  });

  it('emitToManagers targets both the manager and admin rooms', () => {
    const emit = jest.fn();
    const chainedTo = jest.fn(() => ({ emit }));
    const to = jest
      .spyOn(io, 'to')
      .mockReturnValue({ to: chainedTo, emit } as unknown as ReturnType<
        typeof io.to
      >);

    const payload = { id: 'o1' };
    emitToManagers(RealtimeEvent.ORDER_CREATED, payload);

    expect(to).toHaveBeenCalledWith(`role:${RoleEnum.MANAGER}`);
    expect(chainedTo).toHaveBeenCalledWith(`role:${RoleEnum.ADMIN}`);
    expect(emit).toHaveBeenCalledWith(RealtimeEvent.ORDER_CREATED, payload);
    to.mockRestore();
  });

  it('exposes the slots:changed event name for booking clients', () => {
    expect(RealtimeEvent.SLOTS_CHANGED).toBe('slots:changed');
  });

  it('emitToOps targets manager, admin and cashier rooms', () => {
    const emit = jest.fn();
    // Chuỗi .to().to() — mock tự trả lại chính nó để nhận mọi lần gọi kế tiếp.
    const chain: { to: jest.Mock; emit: jest.Mock } = { to: jest.fn(), emit };
    chain.to.mockReturnValue(chain);
    const chainedTo = chain.to;
    const to = jest
      .spyOn(io, 'to')
      .mockReturnValue(chain as unknown as ReturnType<typeof io.to>);

    const payload = { id: 'o1' };
    emitToOps(RealtimeEvent.ORDER_STATUS, payload);

    expect(to).toHaveBeenCalledWith(`role:${RoleEnum.MANAGER}`);
    expect(chainedTo).toHaveBeenNthCalledWith(1, `role:${RoleEnum.ADMIN}`);
    expect(chainedTo).toHaveBeenNthCalledWith(2, `role:${RoleEnum.CASHIER}`);
    expect(emit).toHaveBeenCalledWith(RealtimeEvent.ORDER_STATUS, payload);
    to.mockRestore();
  });

  it('emitToCustomers targets the customer role room', () => {
    const emit = jest.fn();
    const to = jest
      .spyOn(io, 'to')
      .mockReturnValue({ to: jest.fn(), emit } as unknown as ReturnType<
        typeof io.to
      >);

    const payload = { date: '2026-07-15' };
    emitToCustomers(RealtimeEvent.SLOTS_CHANGED, payload);

    expect(to).toHaveBeenCalledWith(`role:${RoleEnum.CUSTOMER}`);
    expect(emit).toHaveBeenCalledWith(RealtimeEvent.SLOTS_CHANGED, payload);
    to.mockRestore();
  });
});

describe('Redis adapter', () => {
  it('does not attach (and does not throw) when Redis is disabled', () => {
    const adapter = jest.fn();
    const io = { adapter } as unknown as Server;

    // jest.setup.ts sets SOCKET_REDIS_ENABLED=false, mirroring a deployment
    // with no REDIS_URL: the server must still boot, single-instance.
    expect(config.realtime.redisEnabled).toBe(false);
    expect(attachRedisAdapter(io)).toBe(false);
    expect(adapter).not.toHaveBeenCalled();
  });
});

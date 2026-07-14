/**
 * Runs before any module is imported (jest `setupFiles`), which is the only
 * place these can be set: `src/config` reads process.env at import time, and
 * dotenv does not override values that already exist.
 *
 * CI has no .env file, so without this the JWT secret would be '' and signing a
 * test token would throw.
 */
process.env.JWT_ACCESS_SECRET = 'test-access-secret';

// Never let a test open a real Redis connection (a developer's .env has a live
// REDIS_URL). Realtime tests assert single-instance behaviour.
process.env.SOCKET_REDIS_ENABLED = 'false';
process.env.SOCKET_REDIS_REQUIRED = 'false';
process.env.SOCKET_ALLOW_ANONYMOUS = 'false';

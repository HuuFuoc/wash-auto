/* eslint-disable @typescript-eslint/require-await -- async fakes mirror the real ioredis/email signatures */
import { BadRequestException } from '../../common/exceptions';
import { PasswordResetService } from './password-reset.service';

/** Minimal in-memory stand-in for the four ioredis commands the service uses. */
function fakeRedis() {
  const store = new Map<string, { value: string; ttl: number }>();
  return {
    store,
    get: jest.fn(async (key: string) => store.get(key)?.value ?? null),
    set: jest.fn(
      async (key: string, value: string, _ex: string, ttl: number) => {
        store.set(key, { value, ttl });
        return 'OK';
      },
    ),
    del: jest.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
    ttl: jest.fn(async (key: string) => store.get(key)?.ttl ?? -2),
  };
}

function build() {
  const redis = fakeRedis();
  const emailService = {
    sendPasswordResetEmail: jest.fn(async () => undefined),
  };
  const service = new PasswordResetService(
    redis as never,
    emailService as never,
  );
  return { service, redis, emailService };
}

/** The code never leaves the service, so tests read it off the email mock. */
function sentCode(emailService: { sendPasswordResetEmail: jest.Mock }): string {
  const calls = emailService.sendPasswordResetEmail.mock.calls as Array<
    [to: string, code: string, ttlSeconds: number]
  >;
  return calls[0][1];
}

describe('PasswordResetService', () => {
  it('mails a 6-digit code and stores only its hash', async () => {
    const { service, redis, emailService } = build();
    await service.issueAndSend('Customer@Example.com ', '1.2.3.4');

    const code = sentCode(emailService);
    expect(code).toMatch(/^\d{6}$/);

    // Key is normalised, and the plaintext code is nowhere in the record.
    const stored = redis.store.get('pwreset:code:customer@example.com');
    expect(stored).toBeDefined();
    expect(stored!.value).not.toContain(code);
  });

  it('accepts the correct code exactly once', async () => {
    const { service, emailService } = build();
    await service.issueAndSend('customer@example.com', 'ip');
    const code = sentCode(emailService);

    await expect(
      service.verify('customer@example.com', code),
    ).resolves.toBeUndefined();

    // Replay must fail - the record is burned on success.
    await expect(service.verify('customer@example.com', code)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('burns the code after 5 wrong attempts, even if the rest are correct', async () => {
    const { service, emailService } = build();
    await service.issueAndSend('customer@example.com', 'ip');
    const code = sentCode(emailService);
    const wrong = code === '000000' ? '111111' : '000000';

    for (let i = 0; i < 5; i++) {
      await expect(
        service.verify('customer@example.com', wrong),
      ).rejects.toThrow(BadRequestException);
    }

    await expect(service.verify('customer@example.com', code)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('does not extend the expiry when a wrong code is submitted', async () => {
    const { service, redis, emailService } = build();
    await service.issueAndSend('customer@example.com', 'ip');
    const code = sentCode(emailService);
    const wrong = code === '000000' ? '111111' : '000000';

    const key = 'pwreset:code:customer@example.com';
    redis.store.set(key, { value: redis.store.get(key)!.value, ttl: 42 });

    await expect(service.verify('customer@example.com', wrong)).rejects.toThrow(
      BadRequestException,
    );
    // Re-written with the incremented attempt count, but the original TTL.
    expect(redis.store.get(key)!.ttl).toBe(42);
  });

  it('rejects with the same message whether or not a code was requested', async () => {
    const { service } = build();
    await expect(
      service.verify('nobody@example.com', '123456'),
    ).rejects.toThrow('Invalid or expired reset code');
  });
});

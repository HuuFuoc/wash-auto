/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async redis signatures */
import { BadRequestException } from '../../common/exceptions';
import { config } from '../../config';
import { GoogleAuthService } from './google-auth.service';

describe('GoogleAuthService', () => {
  function build(get: string | null = 'target', del = 1) {
    const redis = {
      set: jest.fn(async () => 'OK'),
      get: jest.fn(async () => get),
      del: jest.fn(async () => del),
    };
    return { redis, service: new GoogleAuthService(redis as never) };
  }

  describe('consumeState', () => {
    it('returns the stored redirect target and deletes the state', async () => {
      const { service, redis } = build(
        'https://wave-wash.vercel.app/dashboard',
      );
      await expect(service.consumeState('abc')).resolves.toBe(
        'https://wave-wash.vercel.app/dashboard',
      );
      expect(redis.del).toHaveBeenCalledWith('google:state:abc');
    });

    it('rejects a callback carrying no state at all', async () => {
      const { service } = build();
      await expect(service.consumeState(undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an unknown or expired state', async () => {
      const { service } = build(null, 0);
      await expect(service.consumeState('stale')).rejects.toThrow(
        BadRequestException,
      );
    });

    // The DEL result is what makes the state single-use: the second caller sees
    // the value (its GET raced ahead of the first DEL) but deletes nothing.
    it('rejects a replay that loses the delete race', async () => {
      const { service } = build('https://wave-wash.vercel.app/', 0);
      await expect(service.consumeState('replayed')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resolveRedirect', () => {
    const fallback = `${config.app.frontendUrl}/auth/google/callback`;

    it('falls back when no redirect is requested', () => {
      const { service } = build();
      expect(service.resolveRedirect(undefined)).toBe(fallback);
      expect(service.resolveRedirect('')).toBe(fallback);
    });

    it('keeps a path on the frontend origin', () => {
      const { service } = build();
      expect(service.resolveRedirect('/orders')).toBe(
        `${config.app.frontendUrl}/orders`,
      );
    });

    // The whole point of the guard: this URL ends up carrying session tokens in
    // its fragment, so sending it anywhere but our own frontend hands them away.
    it('discards an off-origin target', () => {
      const { service } = build();
      expect(service.resolveRedirect('https://evil.example/steal')).toBe(
        fallback,
      );
    });

    // A naive `startsWith(frontendUrl)` check would let this through.
    it('discards a lookalike host that merely starts with the frontend URL', () => {
      const { service } = build();
      expect(
        service.resolveRedirect(`${config.app.frontendUrl}.evil.example/steal`),
      ).toBe(fallback);
    });

    // Protocol-relative URLs are the classic open-redirect bypass: they carry no
    // scheme, so a naive "does it start with http://evil" check misses them, but
    // the browser still leaves our origin.
    it('discards a protocol-relative target', () => {
      const { service } = build();
      expect(service.resolveRedirect('//evil.example/steal')).toBe(fallback);
    });

    // Garbage cannot escape: with no scheme it resolves as a path on our own
    // origin, which is harmless — so it is allowed through rather than rejected.
    it('keeps unparseable junk on the frontend origin', () => {
      const { service } = build();
      expect(service.resolveRedirect('ht!tp://%%%')).toMatch(
        new RegExp(`^${config.app.frontendUrl}/`),
      );
    });
  });
});

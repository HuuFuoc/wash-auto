import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import type Redis from 'ioredis';
import { randomBytes } from 'node:crypto';
import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '../../common/exceptions';
import { config } from '../../config';
import { redisClient } from '../../core/redis';

/** The subset of Google's id_token we actually consume. */
export interface IGoogleProfile {
  /** Google's `sub` claim — stable per account, never reused. */
  googleId: string;
  email: string;
  name: string;
  avatarUrl?: string;
}

/**
 * Everything that talks to Google. Deliberately knows nothing about our users:
 * it turns a browser round-trip (or a client-supplied id_token) into a verified
 * IGoogleProfile, and AuthService decides what that means for an account.
 *
 * Two entry points, because the two kinds of client want different things:
 *  - Redirect flow  (GET /auth/google → Google → GET /auth/google/callback).
 *    The browser never handles a Google token; we swap the one-time `code` for
 *    an id_token server-side using the client secret.
 *  - id_token flow  (POST /auth/google). For an SPA using Google Identity
 *    Services, which already holds a signed id_token and just needs it checked.
 *
 * Both end at verifyIdToken, so the trust decision is made in exactly one place.
 */
export class GoogleAuthService {
  /** CSRF nonce for the redirect flow. Holds the post-login redirect target. */
  private static readonly STATE_PREFIX = 'google:state:';
  /** Long enough to survive a slow consent screen, short enough to be useless later. */
  private static readonly STATE_TTL_SECONDS = 600;

  private client: OAuth2Client | null = null;

  constructor(private readonly redis: Redis = redisClient) {}

  /** False when the GOOGLE_* env vars are missing — the routes then answer 503. */
  isConfigured(): boolean {
    return (
      config.google.clientId.length > 0 && config.google.clientSecret.length > 0
    );
  }

  /**
   * Step 1 of the redirect flow: the Google consent URL to send the browser to.
   *
   * `state` is a one-time random value stored in Redis against the page we
   * should land on afterwards. Google echoes it back to the callback, and a
   * callback whose state we cannot find is one we never started — which is what
   * stops an attacker from feeding us their own authorization code and silently
   * signing a victim's browser into the attacker's account.
   */
  async buildAuthUrl(redirectTarget: string): Promise<string> {
    const state = randomBytes(32).toString('base64url');
    await this.redis.set(
      GoogleAuthService.STATE_PREFIX + state,
      redirectTarget,
      'EX',
      GoogleAuthService.STATE_TTL_SECONDS,
    );

    return this.oauthClient().generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      state,
      // No refresh token is requested: we never call Google again on the user's
      // behalf, we only need the identity once. Hence 'online'.
      access_type: 'online',
      // Lets an already-signed-in user pick which Google account to use instead
      // of being silently forced into the last one they used.
      prompt: 'select_account',
    });
  }

  /**
   * Consumes the state issued by buildAuthUrl and returns where to redirect.
   * Single-use: the DEL result is what decides the winner, so a replayed
   * callback (or two racing ones) can never both succeed.
   */
  async consumeState(state: string | undefined): Promise<string> {
    if (!state) {
      throw new BadRequestException('Missing OAuth state');
    }
    const key = GoogleAuthService.STATE_PREFIX + state;
    const target = await this.redis.get(key);
    const removed = await this.redis.del(key);
    if (target === null || removed === 0) {
      throw new BadRequestException('Invalid or expired OAuth state');
    }
    return target;
  }

  /**
   * Step 2 of the redirect flow: trade the one-time code for an id_token. This
   * call is authenticated with the client secret, which is why the code alone is
   * useless to anyone who intercepts it.
   */
  async exchangeCode(code: string): Promise<IGoogleProfile> {
    let idToken: string | null | undefined;
    try {
      const { tokens } = await this.oauthClient().getToken(code);
      idToken = tokens.id_token;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Google code exchange failed reason=${message}`);
      throw new UnauthorizedException('Google sign-in failed');
    }
    if (!idToken) {
      throw new UnauthorizedException('Google sign-in failed');
    }
    return this.verifyIdToken(idToken);
  }

  /**
   * The single trust boundary. `verifyIdToken` checks Google's signature against
   * their published keys, the expiry, the issuer, AND that the token was minted
   * for OUR client id — that last one matters: a valid id_token issued to some
   * other app would otherwise be replayable here as anyone the attacker likes.
   */
  async verifyIdToken(idToken: string): Promise<IGoogleProfile> {
    let payload: TokenPayload | undefined;
    try {
      const ticket = await this.oauthClient().verifyIdToken({
        idToken,
        audience: config.google.clientId,
      });
      payload = ticket.getPayload();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Google id_token rejected reason=${message}`);
      throw new UnauthorizedException('Invalid Google token');
    }

    if (!payload?.sub || !payload.email) {
      throw new UnauthorizedException('Invalid Google token');
    }
    // An unverified address is just a string the user typed into Google. Trusting
    // it would let anyone claim an existing account by signing up to Google with
    // its email, since AuthService links accounts on an email match.
    if (payload.email_verified !== true) {
      throw new UnauthorizedException('Google email is not verified');
    }

    return {
      googleId: payload.sub,
      email: payload.email.toLowerCase(),
      // Google omits `name` when the user hides their profile; the local part of
      // the address is a usable placeholder they can change later.
      name: payload.name?.trim() || payload.email.split('@')[0],
      avatarUrl: payload.picture,
    };
  }

  /**
   * Where the callback sends the browser once tokens are minted.
   *
   * Anything not under the configured frontend origin is discarded rather than
   * rejected: `?redirect=` arrives from a semi-trusted place (a link the user
   * clicked), and an open redirect on a URL that carries session tokens in its
   * fragment would hand those tokens to whoever supplied the link.
   */
  resolveRedirect(requested: unknown): string {
    const fallback = `${config.app.frontendUrl}/auth/google/callback`;
    if (typeof requested !== 'string' || requested.length === 0) {
      return fallback;
    }
    // Compare parsed origins, not string prefixes: `https://evil.com` starts
    // with neither, but `https://wave-wash.vercel.app.evil.com` DOES start with
    // the frontend URL as plain text.
    try {
      const target = new URL(requested, config.app.frontendUrl);
      if (target.origin !== new URL(config.app.frontendUrl).origin) {
        console.warn(`Rejected off-origin Google redirect target=${requested}`);
        return fallback;
      }
      return target.toString();
    } catch {
      return fallback;
    }
  }

  /** Lazy so a missing client id fails as a 503 on the route, not at import time. */
  private oauthClient(): OAuth2Client {
    if (!this.isConfigured()) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    this.client ??= new OAuth2Client({
      clientId: config.google.clientId,
      clientSecret: config.google.clientSecret,
      redirectUri: config.google.callbackUrl,
    });
    return this.client;
  }
}

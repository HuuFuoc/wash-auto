import { Request, Response } from 'express';
import {
  BadRequestException,
  UnauthorizedException,
} from '../../common/exceptions';
import { config } from '../../config';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { AuthService } from './auth.service';

// Was features/auth/auth.controller.ts (@Controller('auth')). @Ip() → req.ip.
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  // @HttpCode(CREATED) → 201.
  register = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.authService.register(req.body));
  };

  // @HttpCode(OK) → 200.
  login = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.authService.login(req.body));
  };

  /**
   * SPA flow — the client already has an id_token from Google Identity Services
   * and just wants our tokens back. Same JSON shape as POST /auth/login, so the
   * frontend stores the result through exactly the same code path.
   */
  googleLogin = async (req: Request, res: Response): Promise<void> => {
    const { idToken } = req.body as { idToken: string };
    res.json(await this.authService.loginWithGoogleIdToken(idToken));
  };

  /** Redirect flow, step 1 — bounce the browser to Google's consent screen. */
  googleStart = async (req: Request, res: Response): Promise<void> => {
    res.redirect(await this.authService.buildGoogleAuthUrl(req.query.redirect));
  };

  /**
   * Redirect flow, step 2 — Google sends the browser back here.
   *
   * Nothing on this route may answer with JSON: the caller is a browser mid-
   * navigation, not fetch(), so an error has to arrive as a redirect the SPA can
   * render. Hence the catch-all — every failure ends up back on the frontend
   * with `#error=...`.
   *
   * Tokens ride in the URL FRAGMENT, never the query string. A fragment is not
   * sent to the frontend's server, so the refresh token stays out of Vercel's
   * access logs, out of the Referer header, and out of anything server-side that
   * records request paths.
   */
  googleCallback = async (req: Request, res: Response): Promise<void> => {
    const { code, state, error: googleError } = req.query;
    let target = `${config.app.frontendUrl}/auth/google/callback`;
    try {
      target = await this.authService.consumeGoogleState(
        typeof state === 'string' ? state : undefined,
      );
      // The user pressed "Cancel" on the consent screen (or Google refused).
      if (typeof googleError === 'string') {
        throw new UnauthorizedException(googleError);
      }
      if (typeof code !== 'string' || code.length === 0) {
        throw new BadRequestException('Missing authorization code');
      }

      const auth = await this.authService.loginWithGoogleCode(code);
      const params = new URLSearchParams({
        accessToken: auth.accessToken,
        refreshToken: auth.refreshToken,
      });
      res.redirect(`${target}#${params.toString()}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Google sign-in failed';
      console.warn(`Google callback failed reason=${message}`);
      res.redirect(
        `${target}#${new URLSearchParams({ error: message }).toString()}`,
      );
    }
  };

  refresh = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as { refreshToken: string };
    res.json(await this.authService.refresh(refreshToken));
  };

  // @HttpCode(NO_CONTENT) → 204.
  logout = async (req: Request, res: Response): Promise<void> => {
    const { refreshToken } = req.body as { refreshToken: string };
    await this.authService.logout(refreshToken);
    res.status(204).send();
  };

  sendOtp = async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email: string };
    res.json(await this.authService.requestEmailOtp(email, req.ip ?? ''));
  };

  verifyOtp = async (req: Request, res: Response): Promise<void> => {
    const { email, code } = req.body as { email: string; code: string };
    res.json(await this.authService.verifyEmailOtp(email, code, req.ip ?? ''));
  };

  forgotPassword = async (req: Request, res: Response): Promise<void> => {
    const { email } = req.body as { email: string };
    res.json(await this.authService.forgotPassword(email, req.ip ?? ''));
  };

  resetPassword = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.authService.resetPassword(req.body, req.ip ?? ''));
  };

  getMe = (req: AuthRequest, res: Response): void => {
    res.json(req.user);
  };

  adminOnly = (req: AuthRequest, res: Response): void => {
    res.json({ ok: true, user: req.user });
  };
}

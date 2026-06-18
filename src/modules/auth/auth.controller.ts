import { Request, Response } from 'express';
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

  getMe = (req: AuthRequest, res: Response): void => {
    res.json(req.user);
  };

  adminOnly = (req: AuthRequest, res: Response): void => {
    res.json({ ok: true, user: req.user });
  };
}

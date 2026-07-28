import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { ForgotPasswordDto } from '../../shared/auth/dto/forgot-password.dto';
import { LoginDto } from '../../shared/auth/dto/login.dto';
import { OtpSendDto } from '../../shared/auth/dto/otp-send.dto';
import { OtpVerifyDto } from '../../shared/auth/dto/otp-verify.dto';
import { RefreshTokenDto } from '../../shared/auth/dto/refresh-token.dto';
import { GoogleLoginDto } from '../../shared/auth/dto/google-login.dto';
import { RegisterDto } from '../../shared/auth/dto/register.dto';
import { ResetPasswordDto } from '../../shared/auth/dto/reset-password.dto';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { passwordResetRateLimiter } from '../../middlewares/rate-limit.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { loyaltyService } from '../loyalty/loyalty.router';
import { getOtpService } from '../otp/otp.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';
import { PasswordResetService } from './password-reset.service';
import { RoleRepository } from './role.repository';
import { RefreshTokenService } from './refresh-token.service';
import { UserRepository } from './user.repository';
import { VerifiedEmailTokenService } from './verified-email-token.service';

// Manual DI wiring. AuthService needs loyalty + otp SERVICES (one-way: neither
// imports auth's service), plus its own repos + token services.
const userRepository = new UserRepository();
const roleRepository = new RoleRepository();
const refreshTokenService = new RefreshTokenService();
const verifiedEmailTokenService = new VerifiedEmailTokenService();
const passwordResetService = new PasswordResetService();
const googleAuthService = new GoogleAuthService();
const service = new AuthService(
  userRepository,
  roleRepository,
  refreshTokenService,
  loyaltyService,
  getOtpService(),
  verifiedEmailTokenService,
  passwordResetService,
  googleAuthService,
);
const controller = new AuthController(service);

// Mounted at /auth.
export const authRouter = Router();
authRouter.post(
  '/register',
  validateDto(RegisterDto),
  asyncHandler(controller.register),
);
authRouter.post(
  '/login',
  validateDto(LoginDto),
  asyncHandler(controller.login),
);
// Google Sign-In. Two shapes of the same feature — an SPA that already holds an
// id_token POSTs it here; a plain "Sign in with Google" link uses the GET pair
// (consent redirect + callback). Both mint the same token pair, and both
// register the account on first use, so there is no separate sign-up route.
authRouter.post(
  '/google',
  validateDto(GoogleLoginDto),
  asyncHandler(controller.googleLogin),
);
authRouter.get('/google', asyncHandler(controller.googleStart));
authRouter.get('/google/callback', asyncHandler(controller.googleCallback));
authRouter.post(
  '/refresh',
  validateDto(RefreshTokenDto),
  asyncHandler(controller.refresh),
);
authRouter.post(
  '/logout',
  validateDto(RefreshTokenDto),
  asyncHandler(controller.logout),
);
authRouter.post(
  '/otp/send',
  validateDto(OtpSendDto),
  asyncHandler(controller.sendOtp),
);
authRouter.post(
  '/otp/verify',
  validateDto(OtpVerifyDto),
  asyncHandler(controller.verifyOtp),
);
// Limiter sits AFTER validateDto so it keys on the normalised email (see
// passwordResetRateLimiter). Only the request side is throttled: guessing a code
// is already bounded by the 5-attempt counter on the stored code itself.
authRouter.post(
  '/forgot-password',
  validateDto(ForgotPasswordDto),
  passwordResetRateLimiter,
  asyncHandler(controller.forgotPassword),
);
authRouter.post(
  '/reset-password',
  validateDto(ResetPasswordDto),
  asyncHandler(controller.resetPassword),
);
authRouter.get('/me', authMiddleware, asyncHandler(controller.getMe));
authRouter.get(
  '/admin-only',
  authMiddleware,
  roleMiddleware(RoleEnum.ADMIN),
  asyncHandler(controller.adminOnly),
);

// Shared instances reused by user/staff-shift/dashboard/order/work-order/chat.
export { userRepository, roleRepository, verifiedEmailTokenService };

// ---- role seeding (replaces AuthModule.onModuleInit) ----
interface IDefaultRole {
  code: RoleEnum;
  name: string;
  description: string;
}

const DEFAULT_ROLES: IDefaultRole[] = [
  {
    code: RoleEnum.CUSTOMER,
    name: 'Customer',
    description: 'End user who books and pays for washes',
  },
  {
    code: RoleEnum.CASHIER,
    name: 'Cashier',
    description: 'Front-desk staff handling payments and check-in',
  },
  {
    code: RoleEnum.WASHER,
    name: 'Washer',
    description: 'Staff who performs the actual wash',
  },
  {
    code: RoleEnum.MANAGER,
    name: 'Manager',
    description: 'Branch / operations manager',
  },
  {
    code: RoleEnum.ADMIN,
    name: 'Admin',
    description: 'System administrator',
  },
];

export async function seedAuthRoles(): Promise<void> {
  for (const role of DEFAULT_ROLES) {
    await roleRepository.upsertByCode(role);
  }
  console.log(`Seeded ${DEFAULT_ROLES.length} roles`);
}

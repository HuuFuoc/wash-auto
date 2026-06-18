import { Router } from 'express';
import { asyncHandler } from '../../common/async-handler';
import { LoginDto } from '../../shared/auth/dto/login.dto';
import { OtpSendDto } from '../../shared/auth/dto/otp-send.dto';
import { OtpVerifyDto } from '../../shared/auth/dto/otp-verify.dto';
import { RefreshTokenDto } from '../../shared/auth/dto/refresh-token.dto';
import { RegisterDto } from '../../shared/auth/dto/register.dto';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { roleMiddleware } from '../../middlewares/roles.middleware';
import { validateDto } from '../../middlewares/validate.middleware';
import { loyaltyService } from '../loyalty/loyalty.router';
import { getOtpService } from '../otp/otp.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
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
const service = new AuthService(
  userRepository,
  roleRepository,
  refreshTokenService,
  loyaltyService,
  getOtpService(),
  verifiedEmailTokenService,
);
const controller = new AuthController(service);

// Mounted at /auth.
export const authRouter = Router();
authRouter.post(
  '/register',
  validateDto(RegisterDto),
  asyncHandler(controller.register),
);
authRouter.post('/login', validateDto(LoginDto), asyncHandler(controller.login));
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
authRouter.get('/me', authMiddleware, asyncHandler(controller.getMe));
authRouter.get(
  '/admin-only',
  authMiddleware,
  roleMiddleware(RoleEnum.ADMIN),
  asyncHandler(controller.adminOnly),
);

// Shared instances reused by user/staff-shift/dashboard/order/work-order/chat.
export const authService = service;
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

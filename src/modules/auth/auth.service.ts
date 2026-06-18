import * as bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import {
  ConflictException,
  InternalServerErrorException,
  UnauthorizedException,
} from '../../common/exceptions';
import { config } from '../../config';
import { AuthResponseDto } from '../../features/auth/dto/auth-response.dto';
import { LoginDto } from '../../features/auth/dto/login.dto';
import { RegisterDto } from '../../features/auth/dto/register.dto';
import { UserResponseDto } from '../../features/auth/dto/user-response.dto';
import { RoleEnum } from '../../features/auth/types/role.enum';
import { IAuthPayload } from '../../shared/types/auth-payload.type';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { OtpService } from '../otp/otp.service';
import { RoleRepository } from './role.repository';
import { UserDocument } from './user.model';
import { UserRepository } from './user.repository';
import {
  IRefreshTokenPayload,
  RefreshTokenService,
} from './refresh-token.service';
import { VerifiedEmailTokenService } from './verified-email-token.service';

// Business logic copied verbatim from features/auth/auth.service.ts; DI +
// ConfigService + JwtService (now jsonwebtoken) + Nest exceptions + Logger
// were swapped out.
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly loyaltyService: LoyaltyService,
    private readonly otpService: OtpService,
    private readonly verifiedEmailTokenService: VerifiedEmailTokenService,
  ) {}

  /**
   * Step 1 - Request an email OTP. If the user is already verified within the
   * skip window, no email is sent; a verified-email JWT is returned. Response
   * shape is identical whether the email is registered or not.
   */
  async requestEmailOtp(
    email: string,
    ip: string,
  ): Promise<{ message: string; token?: string }> {
    const user = await this.userRepository.findByEmail(email);
    const skipDays = config.otp.verifiedEmailSkipDays;

    if (user && user.is_active && user.email_verified_at) {
      const ageMs = Date.now() - user.email_verified_at.getTime();
      const skipMs = skipDays * 24 * 60 * 60 * 1000;
      if (ageMs < skipMs) {
        const token = await this.verifiedEmailTokenService.sign(
          user._id.toString(),
          user.email,
        );
        console.log(`OTP skipped (recent verify) email=${email} ip=${ip}`);
        return { message: 'Already verified', token };
      }
    }

    if (!user || !user.is_active) {
      // Don't leak existence - but also don't actually send.
      console.log(`OTP request for unknown/inactive email=${email} ip=${ip}`);
      return { message: 'OTP sent if account exists' };
    }

    await this.otpService.issueAndSend(email, ip);
    return { message: 'OTP sent if account exists' };
  }

  /**
   * Step 2 - Verify the OTP. On success, persist email_verified_at and issue
   * the verified-email JWT used as the Authorization for POST /me/bookings.
   */
  async verifyEmailOtp(
    email: string,
    code: string,
    ip: string,
  ): Promise<{ token: string }> {
    await this.otpService.verify(email, code);

    const user = await this.userRepository.findByEmail(email);
    if (!user || !user.is_active) {
      console.warn(`OTP verified for missing user email=${email} ip=${ip}`);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    await this.userRepository.setEmailVerifiedAt(user._id, new Date());
    const token = await this.verifiedEmailTokenService.sign(
      user._id.toString(),
      user.email,
    );

    console.log(`Email verified email=${email} ip=${ip}`);
    return { token };
  }

  async register(dto: RegisterDto): Promise<UserResponseDto> {
    console.log(`Registering new user email=${dto.email}`);

    if (await this.userRepository.existsByEmail(dto.email)) {
      throw new ConflictException('Email already registered');
    }
    if (await this.userRepository.existsByPhone(dto.phone)) {
      throw new ConflictException('Phone already registered');
    }

    const customerRole = await this.roleRepository.findByCode(
      RoleEnum.CUSTOMER,
    );
    if (!customerRole) {
      throw new InternalServerErrorException('Customer role not seeded');
    }

    const saltRounds = config.auth.bcryptSaltRounds;
    const passwordHash = await bcrypt.hash(dto.password, saltRounds);

    const user = await this.userRepository.createUser({
      roleId: customerRole._id,
      name: dto.name,
      phone: dto.phone,
      email: dto.email,
      passwordHash,
      dateOfBirth: dto.dateOfBirth,
    });

    // Auto-create loyalty account at None tier. Idempotent.
    try {
      await this.loyaltyService.ensureForCustomer(user._id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Loyalty auto-create failed userId=${user._id.toString()} reason=${message}`,
      );
    }

    // Trigger email verification OTP right after registration. Fire-and-forget:
    // a SMTP failure must NOT roll back the user creation.
    void this.otpService
      .issueAndSend(user.email, 'register')
      .catch((err: Error) =>
        console.warn(
          `Register OTP dispatch failed email=${user.email} reason=${err.message}`,
        ),
      );

    return UserResponseDto.fromDocument(user, RoleEnum.CUSTOMER);
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    console.log('Login attempt', { email: dto.email });

    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    return this.issueTokenPair(user);
  }

  async refresh(refreshToken: string): Promise<AuthResponseDto> {
    let payload: IRefreshTokenPayload;
    try {
      payload = await this.refreshTokenService.verify(refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (await this.refreshTokenService.isBlacklisted(payload.jti)) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const user = await this.userRepository.findById(payload.sub);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    await this.refreshTokenService.blacklist(payload.jti, payload.exp);

    return this.issueTokenPair(user);
  }

  async logout(refreshToken: string): Promise<void> {
    try {
      const payload = await this.refreshTokenService.verify(refreshToken);
      await this.refreshTokenService.blacklist(payload.jti, payload.exp);
    } catch {
      // Token already invalid/expired - nothing to revoke
    }
  }

  private async issueTokenPair(user: UserDocument): Promise<AuthResponseDto> {
    const role = await this.roleRepository.findById(user.role_id);
    if (!role || !role.is_active) {
      throw new UnauthorizedException('Role is inactive');
    }

    const accessPayload: IAuthPayload = {
      sub: user._id.toString(),
      email: user.email,
      role: role.code,
    };

    const accessToken = jwt.sign(accessPayload, config.auth.accessSecret, {
      expiresIn: config.auth.accessTtl as SignOptions['expiresIn'],
    });

    const refresh = await this.refreshTokenService.sign(user._id.toString());

    return {
      accessToken,
      refreshToken: refresh.token,
      user: UserResponseDto.fromDocument(user, role.code),
    };
  }
}

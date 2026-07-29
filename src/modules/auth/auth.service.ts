import * as bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  UnauthorizedException,
} from '../../common/exceptions';
import { config } from '../../config';
import { AuthResponseDto } from '../../shared/auth/dto/auth-response.dto';
import { LoginDto } from '../../shared/auth/dto/login.dto';
import { RegisterDto } from '../../shared/auth/dto/register.dto';
import { ResetPasswordDto } from '../../shared/auth/dto/reset-password.dto';
import { UserResponseDto } from '../../shared/auth/dto/user-response.dto';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { IAuthPayload } from '../../shared/types/auth-payload.type';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { OtpService } from '../otp/otp.service';
import { GoogleAuthService, IGoogleProfile } from './google-auth.service';
import { PasswordResetService } from './password-reset.service';
import { RoleRepository } from './role.repository';
import { User, UserDocument } from './user.model';
import { UserRepository } from './user.repository';
import {
  IRefreshTokenPayload,
  RefreshTokenService,
} from './refresh-token.service';
import { VerifiedEmailTokenService } from './verified-email-token.service';

/**
 * Mongo E11000 — a unique index rejected the write. Returns the offending field
 * names (from the driver's `keyPattern`), or null when this is not a duplicate
 * key error at all. Which index tripped decides whether the write was a benign
 * race or a broken deployment, so the caller needs more than a boolean.
 */
function duplicateKeyFields(error: unknown): string[] | null {
  if (typeof error !== 'object' || error === null) return null;
  const candidate = error as {
    code?: unknown;
    keyPattern?: Record<string, unknown>;
  };
  if (candidate.code !== 11000) return null;
  return Object.keys(candidate.keyPattern ?? {});
}

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
    private readonly passwordResetService: PasswordResetService,
    private readonly googleAuthService: GoogleAuthService = new GoogleAuthService(),
  ) {}

  /**
   * Same string for every outcome - see forgotPassword. Kept as a constant so a
   * later edit cannot accidentally make one branch distinguishable.
   */
  private static readonly FORGOT_PASSWORD_MESSAGE =
    'If an account exists for that email, a reset code has been sent';

  /**
   * A password sign-up that has not passed its email OTP yet. register() creates
   * these with `is_active: false`; verifyEmailOtp() is what switches them on.
   *
   * `is_active` is doing double duty — "deactivated by an admin" and "never
   * verified" are both false — so the two are told apart by `email_verified_at`,
   * which only the OTP (or a Google link) ever writes. The one case that stays
   * ambiguous: an account an admin switched off BEFORE it was ever verified
   * looks exactly like a fresh sign-up and can re-enable itself by completing
   * the OTP. If that stops being a corner case, the fix is a dedicated
   * verification-status field rather than more inference here.
   */
  private static isPendingVerification(
    user: Pick<User, 'is_active' | 'email_verified_at'>,
  ): boolean {
    return !user.is_active && !user.email_verified_at;
  }

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

    // An account still waiting on its first OTP is inactive BY DESIGN, and this
    // endpoint is how it gets its code (re-send after an expiry, say). Turning it
    // away here would leave every fresh sign-up with no way to ever activate.
    if (
      !user ||
      (!user.is_active && !AuthService.isPendingVerification(user))
    ) {
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
    const pending = user !== null && AuthService.isPendingVerification(user);
    if (!user || (!user.is_active && !pending)) {
      console.warn(`OTP verified for missing user email=${email} ip=${ip}`);
      throw new UnauthorizedException('Invalid or expired OTP');
    }

    // For a sign-up this is the activation step, not just a timestamp: passing
    // the OTP is what makes the account usable. Already-active accounts (the
    // pre-booking re-verification) only get the timestamp refreshed.
    await this.userRepository.setEmailVerifiedAt(user._id, new Date(), pending);
    if (pending) {
      console.log(`Account activated by OTP userId=${user._id.toString()}`);
    }
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
      // Held shut until the OTP below comes back verified, so an address nobody
      // can read never becomes a login. verifyEmailOtp() flips it on.
      isActive: false,
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
    // An unverified sign-up is let through this guard so its password can still
    // be checked; it is turned away further down, once that password has proven
    // the caller owns the account and is therefore entitled to know why.
    const pending = user !== null && AuthService.isPendingVerification(user);
    if (!user || (!user.is_active && !pending)) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // A Google-only account has no hash. Answering with the same generic message
    // as a wrong password keeps this endpoint from confirming which addresses are
    // registered, and it is not a dead end for the user: POST /auth/forgot-password
    // works on these accounts and is the supported way to add a password.
    if (!user.password_hash) {
      console.log(
        `Password login attempt on Google-only account email=${dto.email}`,
      );
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.password_hash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Only now, with the password proven, is it safe to name the real reason:
    // the answer tells a stranger nothing they could not already infer, and the
    // owner needs it to know a code is waiting rather than that they mistyped.
    if (pending) {
      console.log(`Login blocked, email not verified email=${dto.email}`);
      throw new ForbiddenException(
        'Email not verified. Enter the code sent to your email, or request a new one at POST /auth/otp/send.',
      );
    }

    return this.issueTokenPair(user);
  }

  // ---------------------------------------------------------------------------
  // Google Sign-In
  // ---------------------------------------------------------------------------

  /** Consent URL for the redirect flow; `redirect` is where we land afterwards. */
  buildGoogleAuthUrl(redirect: unknown): Promise<string> {
    return this.googleAuthService.buildAuthUrl(
      this.googleAuthService.resolveRedirect(redirect),
    );
  }

  /** Validates the CSRF state and returns the vetted post-login redirect target. */
  consumeGoogleState(state: string | undefined): Promise<string> {
    return this.googleAuthService.consumeState(state);
  }

  /** Redirect flow, step 2: authorization code → our own token pair. */
  async loginWithGoogleCode(code: string): Promise<AuthResponseDto> {
    return this.upsertGoogleUser(
      await this.googleAuthService.exchangeCode(code),
    );
  }

  /** SPA flow: a Google id_token the client already holds → our own token pair. */
  async loginWithGoogleIdToken(idToken: string): Promise<AuthResponseDto> {
    return this.upsertGoogleUser(
      await this.googleAuthService.verifyIdToken(idToken),
    );
  }

  /**
   * Sign-in and sign-up are the same call on purpose — the user only ever presses
   * one button, and which of the three branches below runs is not something they
   * should have to know. In order:
   *
   *  1. Known google_id → straight login. Matched on the `sub` claim rather than
   *     the email so a user who changes their Gmail address keeps their account.
   *  2. Known email, no google_id → link the two. Safe because the profile only
   *     gets this far with `email_verified: true` (see verifyIdToken), i.e.
   *     Google has proven the same mailbox our password account was opened with.
   *  3. Neither → create a customer, already email-verified, with no phone and
   *     no password. Both are addable later (PATCH /me/profile, forgot-password).
   *
   * The profile is trusted here; every check lives in GoogleAuthService.
   */
  private async upsertGoogleUser(
    profile: IGoogleProfile,
  ): Promise<AuthResponseDto> {
    const byGoogleId = await this.userRepository.findByGoogleId(
      profile.googleId,
    );
    if (byGoogleId) {
      if (!byGoogleId.is_active) {
        throw new UnauthorizedException('Account is deactivated');
      }
      return this.issueTokenPair(byGoogleId);
    }

    const byEmail = await this.userRepository.findByEmail(profile.email);
    if (byEmail) {
      // A sign-up that never ran its OTP is not a deactivated account, and this
      // is not a way around the check: Google has just proven ownership of the
      // very mailbox the OTP would have tested, so the link activates it. Without
      // this, registering by password and then pressing "Sign in with Google" is
      // a dead end — the link stamps email_verified_at but the account stays off.
      const pending = AuthService.isPendingVerification(byEmail);
      if (!byEmail.is_active && !pending) {
        throw new UnauthorizedException('Account is deactivated');
      }
      const linked = await this.userRepository.linkGoogleAccount(
        byEmail._id,
        profile.googleId,
        profile.avatarUrl,
        pending,
      );
      // Null means another Google identity claimed this account between the read
      // and the write. Refuse rather than log the caller into someone else's.
      if (!linked) {
        console.warn(
          `Google link conflict userId=${byEmail._id.toString()} googleId=${profile.googleId}`,
        );
        throw new ConflictException(
          'This email is already linked to a different Google account',
        );
      }
      console.log(
        `Linked Google account userId=${linked._id.toString()} email=${profile.email}`,
      );
      return this.issueTokenPair(linked);
    }

    return this.issueTokenPair(await this.createGoogleUser(profile));
  }

  private async createGoogleUser(
    profile: IGoogleProfile,
  ): Promise<UserDocument> {
    const customerRole = await this.roleRepository.findByCode(
      RoleEnum.CUSTOMER,
    );
    if (!customerRole) {
      throw new InternalServerErrorException('Customer role not seeded');
    }

    let user: UserDocument;
    try {
      user = await this.userRepository.createUser({
        roleId: customerRole._id,
        name: profile.name,
        email: profile.email,
        googleId: profile.googleId,
        // Google verified the mailbox for us, so this account skips the OTP the
        // password flow would have required.
        emailVerifiedAt: new Date(),
        avatarUrl: profile.avatarUrl,
      });
    } catch (error) {
      const duplicateFields = duplicateKeyFields(error);
      if (!duplicateFields) throw error;

      // Two first-time logins racing each other: both saw "no such user", one
      // won the unique index. Re-read instead of failing the loser's sign-in.
      const existing = await this.userRepository.findByGoogleId(
        profile.googleId,
      );
      if (existing) return existing;

      // Not a race — the write is genuinely rejected. Never let the driver's
      // message through: it names the database and collection, and the callback
      // paints whatever we throw straight onto the user's screen.
      console.error(
        `Google sign-up rejected by unique index [${duplicateFields.join(', ')}] ` +
          `email=${profile.email}`,
        error,
      );

      if (duplicateFields.includes('phone')) {
        // `phone_1` is still the old plain-unique index, which stores a MISSING
        // field as null — so exactly ONE phone-less account can exist and every
        // Google sign-up after it collides on `{ phone: null }`.
        throw new InternalServerErrorException(
          'Google sign-up is unavailable until the users.phone index is rebuilt ' +
            'as a partial index — run scripts/migrate-google-auth.ts',
        );
      }
      throw new ConflictException('Account already exists');
    }

    // Same fire-and-forget contract as register(): a loyalty hiccup must not
    // cost the user their brand-new account.
    try {
      await this.loyaltyService.ensureForCustomer(user._id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Loyalty auto-create failed userId=${user._id.toString()} reason=${message}`,
      );
    }

    console.log(
      `Registered via Google userId=${user._id.toString()} email=${profile.email}`,
    );
    return user;
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

    // Catches tokens killed en masse by a password reset, which cannot blacklist
    // them individually (jti values are not indexed per user).
    if (await this.refreshTokenService.isRevokedByCutoff(payload)) {
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

  /**
   * Step 1 of the reset - mails a 6-digit code. Returns the SAME message and
   * status whether or not the address belongs to an active account, so the
   * endpoint cannot be used to discover which emails are registered. The
   * per-email throttle is applied by the router before this runs, for the same
   * reason (a 429 that only real accounts can trigger is just as much of a tell).
   *
   * An SMTP failure is allowed to surface as a 500 rather than being swallowed,
   * matching requestEmailOtp: a silent "code sent" that never arrives is the
   * worse failure, and the leak it implies only exists while mail is down.
   */
  async forgotPassword(
    email: string,
    ip: string,
  ): Promise<{ message: string }> {
    const user = await this.userRepository.findByEmail(email);

    if (!user || !user.is_active) {
      console.log(
        `Password reset for unknown/inactive email=${email} ip=${ip}`,
      );
      return { message: AuthService.FORGOT_PASSWORD_MESSAGE };
    }

    await this.passwordResetService.issueAndSend(user.email, ip);
    return { message: AuthService.FORGOT_PASSWORD_MESSAGE };
  }

  /**
   * Step 2 - consumes the code and writes the new password hash. No tokens are
   * returned: the client is expected to send the user back through /auth/login,
   * which keeps this endpoint from being a second way to mint a session.
   */
  async resetPassword(
    dto: ResetPasswordDto,
    ip: string,
  ): Promise<{ message: string }> {
    await this.passwordResetService.verify(dto.email, dto.code);

    const user = await this.userRepository.findByEmail(dto.email);
    if (!user || !user.is_active) {
      // The code was valid, so this means the account was deactivated between
      // request and submit. Reuse the generic message rather than confirming it.
      console.warn(
        `Password reset code valid for missing/inactive user email=${dto.email} ip=${ip}`,
      );
      throw new BadRequestException('Invalid or expired reset code');
    }

    const passwordHash = await bcrypt.hash(
      dto.newPassword,
      config.auth.bcryptSaltRounds,
    );
    const updated = await this.userRepository.updateById(user._id, {
      passwordHash,
    });
    if (!updated) {
      // Deleted between the lookup and the write. Never report success for a
      // password that was not actually stored.
      throw new BadRequestException('Invalid or expired reset code');
    }

    // Whoever triggered the reset may not be the account owner - drop every
    // refresh token minted before now so an attacker's session dies with the
    // old password. Access tokens still run out their (short) TTL.
    await this.refreshTokenService.revokeAllForUser(user._id.toString());

    console.warn(
      `Password reset completed userId=${user._id.toString()} ip=${ip}`,
    );
    return { message: 'Password reset successfully' };
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

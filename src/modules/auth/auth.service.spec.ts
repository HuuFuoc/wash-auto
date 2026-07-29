/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import {
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '../../common/exceptions';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { AuthService } from './auth.service';

describe('AuthService password reset', () => {
  const userId = new Types.ObjectId();

  function build(user: Record<string, unknown> | null) {
    const updateById = jest.fn(async () => ({ _id: userId }));
    const userRepository = {
      findByEmail: jest.fn(async () => user),
      updateById,
    };
    const refreshTokenService = {
      revokeAllForUser: jest.fn(async () => undefined),
    };
    const passwordResetService = {
      issueAndSend: jest.fn(async () => undefined),
      verify: jest.fn(async () => undefined),
    };
    const service = new AuthService(
      userRepository as never,
      {} as never,
      refreshTokenService as never,
      {} as never,
      {} as never,
      {} as never,
      passwordResetService as never,
    );
    return { service, updateById, refreshTokenService, passwordResetService };
  }

  const activeUser = {
    _id: userId,
    email: 'customer@example.com',
    is_active: true,
  };

  describe('forgotPassword', () => {
    it('mails a code for an active account', async () => {
      const { service, passwordResetService } = build(activeUser);
      const res = await service.forgotPassword(
        'customer@example.com',
        '1.2.3.4',
      );
      expect(passwordResetService.issueAndSend).toHaveBeenCalledWith(
        'customer@example.com',
        '1.2.3.4',
      );
      expect(res.message).toMatch(/if an account exists/i);
    });

    // The whole point of the endpoint's contract: an attacker must not be able
    // to tell a registered address from an unregistered one.
    it('returns the identical message for an unknown email, without mailing', async () => {
      const known = build(activeUser);
      const unknown = build(null);
      const knownRes = await known.service.forgotPassword(
        'a@example.com',
        'ip',
      );
      const unknownRes = await unknown.service.forgotPassword(
        'b@example.com',
        'ip',
      );

      expect(unknownRes.message).toBe(knownRes.message);
      expect(unknown.passwordResetService.issueAndSend).not.toHaveBeenCalled();
    });

    it('does not mail a deactivated account', async () => {
      const { service, passwordResetService } = build({
        ...activeUser,
        is_active: false,
      });
      await service.forgotPassword('customer@example.com', 'ip');
      expect(passwordResetService.issueAndSend).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    const dto = {
      email: 'customer@example.com',
      code: '123456',
      newPassword: 'new-password-123',
    };

    it('stores a new hash and revokes existing sessions', async () => {
      const { service, updateById, refreshTokenService } = build(activeUser);
      const res = await service.resetPassword(dto, '1.2.3.4');

      expect(res.message).toBe('Password reset successfully');
      const { passwordHash } = updateById.mock.calls[0][1] as unknown as {
        passwordHash: string;
      };
      expect(await bcrypt.compare('new-password-123', passwordHash)).toBe(true);
      expect(refreshTokenService.revokeAllForUser).toHaveBeenCalledWith(
        userId.toString(),
      );
    });

    it('rejects a bad code without touching the password', async () => {
      const { service, updateById, passwordResetService } = build(activeUser);
      passwordResetService.verify.mockRejectedValueOnce(
        new BadRequestException('Invalid or expired reset code'),
      );

      await expect(service.resetPassword(dto, 'ip')).rejects.toThrow(
        BadRequestException,
      );
      expect(updateById).not.toHaveBeenCalled();
    });

    // Valid code, but the account was disabled in the meantime.
    it('rejects when the account is no longer active', async () => {
      const { service, updateById, refreshTokenService } = build({
        ...activeUser,
        is_active: false,
      });
      await expect(service.resetPassword(dto, 'ip')).rejects.toThrow(
        BadRequestException,
      );
      expect(updateById).not.toHaveBeenCalled();
      expect(refreshTokenService.revokeAllForUser).not.toHaveBeenCalled();
    });
  });
});

/**
 * A password sign-up is created switched OFF and only the email OTP switches it
 * on, so these three endpoints have to agree on what "inactive" means: register
 * writes the state, otp/verify clears it, and login has to tell it apart from an
 * account an admin deactivated. `email_verified_at` is the only thing separating
 * the two - see AuthService.isPendingVerification.
 */
describe('AuthService email-verification lifecycle', () => {
  const userId = new Types.ObjectId();
  const roleId = new Types.ObjectId();
  const password = 'correct-horse-battery';

  function build(user: Record<string, unknown> | null) {
    const created = {
      _id: userId,
      name: 'Nguyen Van A',
      email: 'customer@example.com',
      is_active: false,
    };
    const userRepository = {
      existsByEmail: jest.fn(async () => false),
      existsByPhone: jest.fn(async () => false),
      createUser: jest.fn(async () => created),
      findByEmail: jest.fn(async () => user),
      setEmailVerifiedAt: jest.fn(async () => undefined),
    };
    const roleRepository = {
      findByCode: jest.fn(async () => ({
        _id: roleId,
        code: RoleEnum.CUSTOMER,
      })),
      findById: jest.fn(async () => ({
        _id: roleId,
        code: RoleEnum.CUSTOMER,
        is_active: true,
      })),
    };
    const refreshTokenService = {
      sign: jest.fn(async () => ({ token: 'refresh-token', jti: 'jti' })),
    };
    const loyaltyService = {
      ensureForCustomer: jest.fn(async () => undefined),
    };
    const otpService = {
      issueAndSend: jest.fn(async () => undefined),
      verify: jest.fn(async () => undefined),
    };
    const verifiedEmailTokenService = {
      sign: jest.fn(async () => 'verified-email-token'),
    };
    const service = new AuthService(
      userRepository as never,
      roleRepository as never,
      refreshTokenService as never,
      loyaltyService as never,
      otpService as never,
      verifiedEmailTokenService,
      {} as never,
    );
    return { service, userRepository, otpService };
  }

  /** An account whose OTP is still outstanding: off, and never verified. */
  const pendingUser = async () => ({
    _id: userId,
    email: 'customer@example.com',
    is_active: false,
    password_hash: await bcrypt.hash(password, 10),
  });

  describe('register', () => {
    it('creates the account switched off and mails the code', async () => {
      const { service, userRepository, otpService } = build(null);

      const res = await service.register({
        name: 'Nguyen Van A',
        phone: '0901234567',
        email: 'customer@example.com',
        password,
      });

      expect(userRepository.createUser).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
      expect(res.isActive).toBe(false);
      expect(otpService.issueAndSend).toHaveBeenCalledWith(
        'customer@example.com',
        'register',
      );
    });
  });

  describe('verifyEmailOtp', () => {
    it('activates an account that was waiting on its first verification', async () => {
      const { service, userRepository } = build(await pendingUser());

      await service.verifyEmailOtp('customer@example.com', '123456', 'ip');

      expect(userRepository.setEmailVerifiedAt).toHaveBeenCalledWith(
        userId,
        expect.any(Date),
        true,
      );
    });

    // The pre-booking re-verification: nothing to activate, just a fresh stamp.
    it('only re-stamps an account that is already active', async () => {
      const { service, userRepository } = build({
        _id: userId,
        email: 'customer@example.com',
        is_active: true,
        email_verified_at: new Date('2026-01-01'),
      });

      await service.verifyEmailOtp('customer@example.com', '123456', 'ip');

      expect(userRepository.setEmailVerifiedAt).toHaveBeenCalledWith(
        userId,
        expect.any(Date),
        false,
      );
    });

    // Verified once, then switched off by an admin - the OTP is not a way back in.
    it('refuses to revive an account an admin deactivated', async () => {
      const { service, userRepository } = build({
        _id: userId,
        email: 'customer@example.com',
        is_active: false,
        email_verified_at: new Date('2026-01-01'),
      });

      await expect(
        service.verifyEmailOtp('customer@example.com', '123456', 'ip'),
      ).rejects.toThrow(UnauthorizedException);
      expect(userRepository.setEmailVerifiedAt).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('names the real reason once the password proves who is asking', async () => {
      const { service } = build(await pendingUser());

      await expect(
        service.login({ email: 'customer@example.com', password }),
      ).rejects.toThrow(ForbiddenException);
    });

    // A stranger guessing at addresses learns nothing: the unverified state is
    // only disclosed behind a correct password.
    it('still answers a wrong password on the same account generically', async () => {
      const { service } = build(await pendingUser());

      await expect(
        service.login({
          email: 'customer@example.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('requestEmailOtp', () => {
    // Without this the account could never be activated: it is inactive, and
    // this endpoint is the only way to get a replacement code.
    it('re-sends a code to an account still waiting on verification', async () => {
      const { service, otpService } = build(await pendingUser());

      await service.requestEmailOtp('customer@example.com', 'ip');

      expect(otpService.issueAndSend).toHaveBeenCalledWith(
        'customer@example.com',
        'ip',
      );
    });

    it('sends nothing to an account an admin deactivated', async () => {
      const { service, otpService } = build({
        _id: userId,
        email: 'customer@example.com',
        is_active: false,
        email_verified_at: new Date('2026-01-01'),
      });

      await service.requestEmailOtp('customer@example.com', 'ip');

      expect(otpService.issueAndSend).not.toHaveBeenCalled();
    });
  });
});

/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { BadRequestException } from '../../common/exceptions';
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

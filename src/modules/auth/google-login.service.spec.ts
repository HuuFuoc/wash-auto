/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import { Types } from 'mongoose';
import {
  ConflictException,
  UnauthorizedException,
} from '../../common/exceptions';
import { RoleEnum } from '../../shared/auth/types/role.enum';
import { AuthService } from './auth.service';
import { IGoogleProfile } from './google-auth.service';
import { ICreateUserInput } from './user.repository';

/**
 * Covers upsertGoogleUser's three branches through the public entry point
 * (loginWithGoogleIdToken). GoogleAuthService is stubbed to hand back an
 * already-verified profile — its own checks are covered in
 * google-auth.service.spec.ts, so these tests are about what an account does
 * with a profile, not whether the profile is trustworthy.
 */
describe('AuthService Google sign-in', () => {
  const userId = new Types.ObjectId();
  const roleId = new Types.ObjectId();

  const profile: IGoogleProfile = {
    googleId: '110000000000000000001',
    email: 'customer@example.com',
    name: 'Nguyen Van A',
    avatarUrl: 'https://lh3.googleusercontent.com/a/pic',
  };

  function build(overrides: {
    byGoogleId?: Record<string, unknown> | null;
    byEmail?: Record<string, unknown> | null;
    linked?: Record<string, unknown> | null;
  }) {
    const created = {
      _id: userId,
      role_id: roleId,
      email: profile.email,
      name: profile.name,
      is_active: true,
    };
    // Parameter is declared (rather than `async () =>`) purely so TypeScript
    // knows `createUser.mock.calls[0][0]` exists when the assertions read it.
    const createUser = jest.fn(async (_input: ICreateUserInput) => created);
    const linkGoogleAccount = jest.fn(async () =>
      overrides.linked === undefined
        ? { ...created, google_id: profile.googleId }
        : overrides.linked,
    );
    const userRepository = {
      findByGoogleId: jest.fn(async () => overrides.byGoogleId ?? null),
      findByEmail: jest.fn(async () => overrides.byEmail ?? null),
      linkGoogleAccount,
      createUser,
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
    const googleAuthService = {
      verifyIdToken: jest.fn(async () => profile),
    };
    const service = new AuthService(
      userRepository as never,
      roleRepository as never,
      refreshTokenService as never,
      loyaltyService as never,
      {} as never,
      {} as never,
      {} as never,
      googleAuthService as never,
    );
    return {
      service,
      userRepository,
      createUser,
      linkGoogleAccount,
      loyaltyService,
    };
  }

  it('logs in an account already linked to this Google id', async () => {
    const { service, createUser, linkGoogleAccount } = build({
      byGoogleId: {
        _id: userId,
        role_id: roleId,
        email: profile.email,
        is_active: true,
      },
    });

    const res = await service.loginWithGoogleIdToken('id-token');

    expect(res.accessToken).toEqual(expect.any(String));
    expect(res.user.email).toBe(profile.email);
    expect(createUser).not.toHaveBeenCalled();
    expect(linkGoogleAccount).not.toHaveBeenCalled();
  });

  it('links a pre-existing password account with the same email', async () => {
    const { service, linkGoogleAccount, createUser } = build({
      byGoogleId: null,
      byEmail: {
        _id: userId,
        role_id: roleId,
        email: profile.email,
        is_active: true,
      },
    });

    await service.loginWithGoogleIdToken('id-token');

    expect(linkGoogleAccount).toHaveBeenCalledWith(
      userId,
      profile.googleId,
      profile.avatarUrl,
    );
    expect(createUser).not.toHaveBeenCalled();
  });

  // linkGoogleAccount's `google_id: { $exists: false }` guard returned no doc:
  // a different Google identity got there first. Logging this caller in would
  // put them inside someone else's account.
  it('refuses when the email is already linked to another Google account', async () => {
    const { service } = build({
      byGoogleId: null,
      byEmail: {
        _id: userId,
        role_id: roleId,
        email: profile.email,
        is_active: true,
      },
      linked: null,
    });

    await expect(service.loginWithGoogleIdToken('id-token')).rejects.toThrow(
      ConflictException,
    );
  });

  it('registers a new customer with no phone, no password, already verified', async () => {
    const { service, createUser, loyaltyService } = build({
      byGoogleId: null,
      byEmail: null,
    });

    const res = await service.loginWithGoogleIdToken('id-token');

    const input = createUser.mock.calls[0][0];
    expect(input).toMatchObject({
      roleId,
      email: profile.email,
      name: profile.name,
      googleId: profile.googleId,
      avatarUrl: profile.avatarUrl,
    });
    expect(input.phone).toBeUndefined();
    expect(input.passwordHash).toBeUndefined();
    expect(input.emailVerifiedAt).toBeInstanceOf(Date);
    expect(loyaltyService.ensureForCustomer).toHaveBeenCalledWith(userId);
    expect(res.refreshToken).toBe('refresh-token');
  });

  it('refuses a deactivated account instead of reviving it', async () => {
    const { service } = build({
      byGoogleId: {
        _id: userId,
        role_id: roleId,
        email: profile.email,
        is_active: false,
      },
    });

    await expect(service.loginWithGoogleIdToken('id-token')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  /**
   * The un-run migration, as it actually reached production: the old non-sparse
   * `phone_1` index treats a missing field as null, so the first phone-less
   * account is fine and every Google sign-up after it dies on `{ phone: null }`.
   */
  describe('when createUser hits a unique index', () => {
    const e11000 = (keyPattern: Record<string, number>) =>
      Object.assign(new Error('E11000 duplicate key error'), {
        code: 11000,
        keyPattern,
      });

    it('recovers a racing sign-up by re-reading the winner', async () => {
      const { service, userRepository, createUser } = build({
        byGoogleId: null,
        byEmail: null,
      });
      const winner = {
        _id: userId,
        role_id: roleId,
        email: profile.email,
        is_active: true,
      };
      createUser.mockRejectedValueOnce(e11000({ google_id: 1 }));
      // First lookup (before insert) misses, second (after the clash) finds it.
      userRepository.findByGoogleId
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);

      await expect(
        service.loginWithGoogleIdToken('id-token'),
      ).resolves.toMatchObject({ refreshToken: 'refresh-token' });
    });

    it('reports the phone-index collision as a fixable server fault', async () => {
      const { service, createUser } = build({
        byGoogleId: null,
        byEmail: null,
      });
      createUser.mockRejectedValueOnce(e11000({ phone: 1 }));

      await expect(service.loginWithGoogleIdToken('id-token')).rejects.toThrow(
        /migrate-google-auth/,
      );
    });

    // The driver's message names the database and collection, and the redirect
    // callback paints whatever we throw onto the user's screen.
    it('never leaks the raw driver message', async () => {
      const { service, createUser } = build({
        byGoogleId: null,
        byEmail: null,
      });
      createUser.mockRejectedValueOnce(
        Object.assign(
          new Error(
            'E11000 duplicate key error collection: wdp301.users index: email_1',
          ),
          { code: 11000, keyPattern: { email: 1 } },
        ),
      );

      const thrown = await service
        .loginWithGoogleIdToken('id-token')
        .catch((err: Error) => err);

      expect(thrown).toBeInstanceOf(ConflictException);
      expect((thrown as Error).message).not.toContain('wdp301');
    });
  });

  // A loyalty outage must not cost the user the account that was just created.
  it('still signs the user in when loyalty setup fails', async () => {
    const { service, loyaltyService } = build({
      byGoogleId: null,
      byEmail: null,
    });
    loyaltyService.ensureForCustomer.mockRejectedValueOnce(
      new Error('loyalty down'),
    );

    await expect(
      service.loginWithGoogleIdToken('id-token'),
    ).resolves.toMatchObject({ refreshToken: 'refresh-token' });
  });
});

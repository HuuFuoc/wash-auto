/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import * as bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { BadRequestException } from '../../common/exceptions';
import { UserService } from './user.service';

describe('UserService.changePassword', () => {
  const userId = new Types.ObjectId();

  function build(passwordHash: string) {
    const updateById = jest.fn(async () => ({ _id: userId }));
    const userRepository = {
      findById: jest.fn(async () => ({
        _id: userId,
        password_hash: passwordHash,
      })),
      updateById,
    };
    const service = new UserService(userRepository as never, {} as never);
    return { service, updateById };
  }

  it('rejects when the old password does not match', async () => {
    const { service, updateById } = build(await bcrypt.hash('correct-old', 4));
    await expect(
      service.changePassword(userId.toString(), {
        oldPassword: 'wrong-old',
        newPassword: 'new-password-123',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(updateById).not.toHaveBeenCalled();
  });

  it('stores a new hash when the old password matches', async () => {
    const { service, updateById } = build(await bcrypt.hash('correct-old', 4));
    const res = await service.changePassword(userId.toString(), {
      oldPassword: 'correct-old',
      newPassword: 'new-password-123',
    });
    expect(res.message).toBe('Password changed successfully');
    expect(updateById).toHaveBeenCalledTimes(1);
    const { passwordHash } = updateById.mock.calls[0][1] as unknown as {
      passwordHash: string;
    };
    expect(await bcrypt.compare('new-password-123', passwordHash)).toBe(true);
  });
});

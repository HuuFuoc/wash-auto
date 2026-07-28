import { Query, Types } from 'mongoose';
import { UserModel } from './user.model';
import { UserRepository } from './user.repository';

/**
 * These run the REAL Mongoose query builder — only `exec` is stubbed, so no
 * database is needed. That matters: linkGoogleAccount shipped broken because
 * every other test mocked the repository away, and Mongoose 9 rejects an
 * update pipeline at query-BUILD time ("Cannot pass an array to query updates
 * unless the `updatePipeline` option is set"), which a mocked repo never sees.
 */
describe('UserRepository.linkGoogleAccount', () => {
  const repository = new UserRepository();
  const userId = new Types.ObjectId();
  const linked = { _id: userId };

  /** [filter, update, options] as handed to Mongoose. */
  type FindOneAndUpdateArgs = [
    Record<string, unknown>,
    Array<{ $set: Record<string, unknown> }>,
    Record<string, unknown>,
  ];

  let execSpy: jest.SpyInstance;
  let buildSpy: jest.SpyInstance;

  // Typed by assertion rather than a return annotation: jest types the recorded
  // call as `any`, and an annotation would make the assertion "unnecessary" to
  // one lint rule while leaving the `any` for another to reject.
  const argsOf = () =>
    buildSpy.mock.calls[0] as unknown as FindOneAndUpdateArgs;

  beforeEach(() => {
    // Only `exec` is stubbed. `findOneAndUpdate` is spied WITHOUT an
    // implementation, so jest calls through to the real builder — which is the
    // code that throws when the pipeline option is missing.
    execSpy = jest.spyOn(Query.prototype, 'exec').mockResolvedValue(linked);
    buildSpy = jest.spyOn(UserModel, 'findOneAndUpdate');
  });

  afterEach(() => {
    execSpy.mockRestore();
    buildSpy.mockRestore();
  });

  // The actual regression. Without `updatePipeline: true` this rejects before
  // the driver is ever reached, and the Google callback surfaces it to the user
  // as "Đăng nhập Google không thành công".
  it('builds the update without tripping the Mongoose 9 pipeline guard', async () => {
    await expect(
      repository.linkGoogleAccount(userId, '110000000000000000001'),
    ).resolves.toBe(linked);
  });

  it('sends an aggregation pipeline with updatePipeline enabled', async () => {
    await repository.linkGoogleAccount(userId, 'google-sub');

    const [, update, options] = argsOf();
    expect(Array.isArray(update)).toBe(true);
    expect(options).toMatchObject({
      updatePipeline: true,
      returnDocument: 'after',
    });
  });

  // The guard that stops one Google identity from hijacking an account another
  // has already claimed — if this filter is ever dropped, the 409 branch in
  // AuthService.upsertGoogleUser becomes unreachable.
  it('only matches an account that has no Google identity yet', async () => {
    await repository.linkGoogleAccount(userId, 'google-sub');

    expect(argsOf()[0]).toEqual({
      _id: userId,
      google_id: { $exists: false },
    });
  });

  it('stamps google_id and email_verified_at', async () => {
    await repository.linkGoogleAccount(userId, 'google-sub');

    const [stage] = argsOf()[1];
    expect(stage.$set.google_id).toBe('google-sub');
    expect(stage.$set.email_verified_at).toBeInstanceOf(Date);
  });

  it('guards an existing avatar behind $ifNull rather than overwriting it', async () => {
    await repository.linkGoogleAccount(userId, 'google-sub', 'https://pic');

    const [stage] = argsOf()[1];
    expect(stage.$set.avatar_url).toEqual({
      $ifNull: ['$avatar_url', 'https://pic'],
    });
  });

  it('leaves avatar_url alone when Google gives no picture', async () => {
    await repository.linkGoogleAccount(userId, 'google-sub');

    const [stage] = argsOf()[1];
    expect(stage.$set).not.toHaveProperty('avatar_url');
  });
});

/**
 * createUser has the same exposure: a Google sign-up must leave `phone` ABSENT,
 * because the unique index on it is sparse and a null WOULD be indexed — the
 * second phone-less account would then collide with the first.
 */
describe('UserRepository.createUser', () => {
  const repository = new UserRepository();
  let createSpy: jest.SpyInstance;

  beforeEach(() => {
    createSpy = jest
      .spyOn(UserModel, 'create')
      .mockResolvedValue({ _id: new Types.ObjectId() } as never);
  });

  afterEach(() => createSpy.mockRestore());

  it('passes phone and password_hash as undefined for a Google sign-up', async () => {
    await repository.createUser({
      roleId: new Types.ObjectId(),
      name: 'Nguyen Van A',
      email: 'Customer@Example.com',
      googleId: 'google-sub',
      emailVerifiedAt: new Date(),
    });

    const calls = createSpy.mock.calls as unknown as Array<
      [Record<string, unknown>]
    >;
    const doc = calls[0][0];
    expect(doc.phone).toBeUndefined();
    expect(doc.password_hash).toBeUndefined();
    expect(doc.google_id).toBe('google-sub');
    // Lower-cased on the way in, so the findByEmail lookup can match it later.
    expect(doc.email).toBe('customer@example.com');
  });
});

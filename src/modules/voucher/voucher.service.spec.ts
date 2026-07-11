/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import { Types } from 'mongoose';
import { VoucherService } from './voucher.service';
import { NotFoundException } from '../../common/exceptions';

function makeRedis() {
  let n = 0;
  return {
    incr: jest.fn(async () => ++n),
    expire: jest.fn(async () => 1),
  };
}

describe('VoucherService.adminBulkCreate', () => {
  it('creates the requested quantity of pool vouchers with the prefix', async () => {
    const repository = {
      createBulk: jest.fn(async (inputs: Array<Record<string, unknown>>) =>
        inputs.map((i) => ({
          _id: new Types.ObjectId(),
          code: i.code,
          type: i.type,
          status: 'unused',
          discount_cap_vnd: i.discountCapVnd,
          expires_at: i.expiresAt,
          created_at: new Date(),
        })),
      ),
    };
    const service = new VoucherService(
      repository as never,
      {} as never,
      {} as never,
      makeRedis() as never,
    );
    const res = await service.adminBulkCreate({ quantity: 3, prefix: 'TET' });
    expect(res.count).toBe(3);
    expect(repository.createBulk).toHaveBeenCalledTimes(1);
    expect(repository.createBulk.mock.calls[0][0]).toHaveLength(3);
    for (const v of res.vouchers) expect(v.code.startsWith('TET-')).toBe(true);
  });
});

describe('VoucherService.claimByCode', () => {
  it('throws NotFound when the code cannot be claimed', async () => {
    const repository = { claimByCode: jest.fn(async () => null) };
    const service = new VoucherService(
      repository as never,
      {} as never,
      {} as never,
      makeRedis() as never,
    );
    await expect(
      service.claimByCode(new Types.ObjectId().toString(), 'NOPE'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('claims an available code and returns the voucher', async () => {
    const customerId = new Types.ObjectId();
    const claimed = {
      _id: new Types.ObjectId(),
      customer_id: customerId,
      code: 'TET-20260620-0001',
      type: 'free_wash',
      status: 'unused',
      discount_cap_vnd: 100000,
      expires_at: new Date(),
      created_at: new Date(),
    };
    const repository = {
      claimByCode: jest.fn(async () => claimed),
      // batch-format codes are gated on "already claimed one from this batch?"
      existsInBatchForCustomer: jest.fn(async () => false),
    };
    const service = new VoucherService(
      repository as never,
      {} as never,
      {} as never,
      makeRedis() as never,
    );
    const res = await service.claimByCode(
      customerId.toString(),
      'tet-20260620-0001',
    );
    expect(res.code).toBe('TET-20260620-0001');
    expect(repository.existsInBatchForCustomer).toHaveBeenCalledWith(
      'TET-20260620',
      customerId.toString(),
    );
    expect(repository.claimByCode).toHaveBeenCalledWith(
      'TET-20260620-0001',
      customerId.toString(),
    );
  });
});

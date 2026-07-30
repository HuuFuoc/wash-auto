/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo/service signatures */
import { Types } from 'mongoose';
import { VoucherService } from './voucher.service';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '../../common/exceptions';
import { VoucherSourceEnum } from '../../shared/voucher/types/voucher-source.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { CampaignStatusEnum } from '../../shared/voucher-campaign/types/campaign-status.enum';

/** Minimal document shape VoucherResponseDto.fromDocument needs. */
function voucherDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    customer_id: new Types.ObjectId(),
    code: 'WASH-4KP9XM2A7B',
    type: 'free_wash',
    status: VoucherStatusEnum.UNUSED,
    discount_cap_vnd: 100000,
    expires_at: new Date(Date.now() + 86_400_000),
    created_at: new Date(),
    ...over,
  };
}

function campaignDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'tet-2026',
    status: CampaignStatusEnum.ACTIVE,
    source: VoucherSourceEnum.CAMPAIGN,
    valid_from: new Date(Date.now() - 86_400_000),
    valid_until: new Date(Date.now() + 86_400_000),
    max_uses_per_customer: 1,
    max_uses_total: undefined,
    ...over,
  };
}

function makeService(
  repository: Record<string, unknown>,
  campaignRepository: Record<string, unknown> = {
    findByPublicClaimCode: jest.fn(async () => null),
    findById: jest.fn(async () => null),
  },
  loyaltyAccountRepository: Record<string, unknown> = {
    findByCustomerId: jest.fn(async () => null),
  },
) {
  return new VoucherService(
    repository as never,
    {} as never,
    {} as never,
    campaignRepository as never,
    {} as never,
    loyaltyAccountRepository as never,
  );
}

describe('VoucherService.adminBulkCreate', () => {
  it('creates the requested quantity of pool vouchers with the prefix', async () => {
    const repository = {
      createBulk: jest.fn(async (inputs: Array<Record<string, unknown>>) =>
        inputs.map((i) => voucherDoc({ code: i.code, customer_id: undefined })),
      ),
    };
    const res = await makeService(repository).adminBulkCreate({
      quantity: 3,
      prefix: 'TET',
    });

    expect(res.count).toBe(3);
    expect(repository.createBulk.mock.calls[0][0]).toHaveLength(3);
    for (const v of res.vouchers) expect(v.code.startsWith('TET-')).toBe(true);
  });

  it('mints unguessable, non-colliding codes across the batch', async () => {
    const repository = {
      createBulk: jest.fn(async (inputs: Array<Record<string, unknown>>) =>
        inputs.map((i) => voucherDoc({ code: i.code })),
      ),
    };
    await makeService(repository).adminBulkCreate({ quantity: 200 });

    const codes = (
      repository.createBulk.mock.calls[0][0] as Array<{ code: string }>
    ).map((i) => i.code);
    expect(new Set(codes).size).toBe(200);
    // Nothing that looks like the old daily sequence.
    expect(codes.some((c) => /-\d{8}-\d{4}$/.test(c))).toBe(false);
  });

  it('stamps every voucher in the batch with its source and reason', async () => {
    const repository = {
      createBulk: jest.fn(async (inputs: Array<Record<string, unknown>>) =>
        inputs.map((i) => voucherDoc({ code: i.code })),
      ),
    };
    await makeService(repository).adminBulkCreate({
      quantity: 2,
      prefix: 'TET',
      reason: 'Chiến dịch Tết 2026',
    });

    const written = repository.createBulk.mock.calls[0][0] as Array<{
      grantedSource: string;
      grantedReason: string;
    }>;
    for (const row of written) {
      expect(row.grantedSource).toBe(VoucherSourceEnum.CAMPAIGN);
      expect(row.grantedReason).toBe('Chiến dịch Tết 2026');
    }
  });

  it('falls back to a batch-derived reason when none is supplied', async () => {
    const repository = {
      createBulk: jest.fn(async (inputs: Array<Record<string, unknown>>) =>
        inputs.map((i) => voucherDoc({ code: i.code })),
      ),
    };
    await makeService(repository).adminBulkCreate({
      quantity: 1,
      prefix: 'TET',
    });

    const written = repository.createBulk.mock.calls[0][0] as Array<{
      grantedReason: string;
    }>;
    expect(written[0].grantedReason).toBe('Lô phát hành TET');
  });
});

describe('VoucherService.grantFreeWash', () => {
  it('records the grant reason and source at mint time, not only on revoke', async () => {
    const repository = {
      create: jest.fn(async (input: Record<string, unknown>) =>
        voucherDoc({ code: input.code }),
      ),
    };
    await makeService(repository).grantFreeWash({
      customerId: new Types.ObjectId(),
      source: VoucherSourceEnum.LOYALTY_MILESTONE,
      reason: 'Thưởng mốc 10 lượt',
    });

    const written = repository.create.mock.calls[0][0] as {
      grantedReason: string;
      grantedSource: string;
    };
    expect(written.grantedReason).toBe('Thưởng mốc 10 lượt');
    expect(written.grantedSource).toBe(VoucherSourceEnum.LOYALTY_MILESTONE);
  });

  it('never leaves the reason empty, even with no caller input', async () => {
    const repository = {
      create: jest.fn(async (input: Record<string, unknown>) =>
        voucherDoc({ code: input.code }),
      ),
    };
    await makeService(repository).grantFreeWash({
      customerId: new Types.ObjectId(),
      source: VoucherSourceEnum.BIRTHDAY,
    });

    const written = repository.create.mock.calls[0][0] as {
      grantedReason: string;
    };
    expect(written.grantedReason).toBe('Quà sinh nhật');
  });

  it('rejects an admin-supplied code that already exists', async () => {
    const repository = {
      findByCode: jest.fn(async () => voucherDoc()),
      create: jest.fn(),
    };
    await expect(
      makeService(repository).grantFreeWash({
        customerId: new Types.ObjectId(),
        code: 'freewash-khoi',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('redraws the code when the unique index rejects a collision', async () => {
    let calls = 0;
    const repository = {
      create: jest.fn(async (input: Record<string, unknown>) => {
        calls += 1;
        if (calls === 1) throw new Error('E11000 duplicate key error');
        return voucherDoc({ code: input.code });
      }),
    };
    const granted = await makeService(repository).grantFreeWash({
      customerId: new Types.ObjectId(),
    });

    expect(granted).toBeTruthy();
    expect(repository.create).toHaveBeenCalledTimes(2);
    const first = repository.create.mock.calls[0][0] as { code: string };
    const second = repository.create.mock.calls[1][0] as { code: string };
    expect(second.code).not.toBe(first.code);
  });

  it('gives up rather than looping forever on a persistent write error', async () => {
    const repository = {
      create: jest.fn(async () => {
        throw new Error('E11000 duplicate key error');
      }),
    };
    await expect(
      makeService(repository).grantFreeWash({
        customerId: new Types.ObjectId(),
      }),
    ).rejects.toThrow(/E11000/);
    expect(repository.create).toHaveBeenCalledTimes(5);
  });
});

describe('VoucherService.claimByCode', () => {
  it('throws NotFound when the code matches nothing', async () => {
    const repository = {
      findByCode: jest.fn(async () => null),
      claimByCode: jest.fn(),
    };
    await expect(
      makeService(repository).claimByCode(
        new Types.ObjectId().toString(),
        'NOPE',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cannot be used to enumerate which codes exist', async () => {
    // Same message whether the code is unknown, taken, or expired — a differing
    // error would confirm a hit to a scraper walking the code space.
    const repository = {
      findByCode: jest.fn(async () => null),
      claimByCode: jest.fn(),
    };
    const service = makeService(repository);
    const customerId = new Types.ObjectId().toString();

    const messages: string[] = [];
    for (const code of ['UNKNOWNCODE', 'TAKEN12345', 'EXPIRED123']) {
      await service.claimByCode(customerId, code).catch((e: Error) => {
        messages.push(e.message);
      });
    }
    expect(new Set(messages).size).toBe(1);
  });

  it('normalizes case and stray whitespace before looking the code up', async () => {
    const customerId = new Types.ObjectId();
    const repository = {
      findByCode: jest.fn(async () =>
        voucherDoc({ code: 'TET-20260620-0001', customer_id: undefined }),
      ),
      claimByCode: jest.fn(async () =>
        voucherDoc({ code: 'TET-20260620-0001', customer_id: customerId }),
      ),
    };
    const res = await makeService(repository).claimByCode(
      customerId.toString(),
      '  tet-20260620-0001 ',
    );

    expect(res.code).toBe('TET-20260620-0001');
    expect(repository.claimByCode).toHaveBeenCalledWith(
      'TET-20260620-0001',
      customerId.toString(),
    );
  });

  it('resolves a campaign by its public claim code, never by parsing the code', async () => {
    const customerId = new Types.ObjectId();
    const campaign = campaignDoc();
    const repository = {
      claimAnyFromCampaign: jest.fn(async () =>
        voucherDoc({ campaign_id: campaign._id, customer_id: customerId }),
      ),
      countByCampaignForCustomer: jest.fn(async () => 0),
      findByCode: jest.fn(),
    };
    const campaignRepository = {
      findByPublicClaimCode: jest.fn(async () => campaign),
      findById: jest.fn(async () => campaign),
    };

    await makeService(repository, campaignRepository).claimByCode(
      customerId.toString(),
      'tet2026',
    );

    expect(campaignRepository.findByPublicClaimCode).toHaveBeenCalledWith(
      'TET2026',
    );
    expect(repository.claimAnyFromCampaign).toHaveBeenCalled();
    // The individual-code path must not run for a campaign claim code.
    expect(repository.findByCode).not.toHaveBeenCalled();
  });

  it('refuses a campaign that is not currently live', async () => {
    const repository = { claimAnyFromCampaign: jest.fn() };
    const campaignRepository = {
      findByPublicClaimCode: jest.fn(async () =>
        campaignDoc({ status: CampaignStatusEnum.PAUSED }),
      ),
    };
    await expect(
      makeService(repository, campaignRepository).claimByCode(
        new Types.ObjectId().toString(),
        'TET2026',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.claimAnyFromCampaign).not.toHaveBeenCalled();
  });

  it('enforces the campaign per-customer limit before claiming', async () => {
    const campaign = campaignDoc({ max_uses_per_customer: 1 });
    const repository = {
      claimAnyFromCampaign: jest.fn(),
      countByCampaignForCustomer: jest.fn(async () => 1), // already at the cap
    };
    const campaignRepository = {
      findByPublicClaimCode: jest.fn(async () => campaign),
    };
    await expect(
      makeService(repository, campaignRepository).claimByCode(
        new Types.ObjectId().toString(),
        'TET2026',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.claimAnyFromCampaign).not.toHaveBeenCalled();
  });

  it('undoes a claim that raced past the per-customer limit', async () => {
    // Two concurrent claims can both pass the pre-check; the post-claim recount
    // is what keeps only one of them.
    const customerId = new Types.ObjectId();
    const campaign = campaignDoc({ max_uses_per_customer: 1 });
    const claimed = voucherDoc({ campaign_id: campaign._id });
    let counted = 0;
    const repository = {
      claimAnyFromCampaign: jest.fn(async () => claimed),
      // 0 before the claim, 2 after — the racing request already landed.
      countByCampaignForCustomer: jest.fn(async () =>
        counted++ === 0 ? 0 : 2,
      ),
      releaseClaim: jest.fn(async () => undefined),
    };
    const campaignRepository = {
      findByPublicClaimCode: jest.fn(async () => campaign),
    };

    await expect(
      makeService(repository, campaignRepository).claimByCode(
        customerId.toString(),
        'TET2026',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.releaseClaim).toHaveBeenCalledWith(
      claimed._id,
      customerId.toString(),
    );
  });

  it('is idempotent: re-claiming a voucher already held returns it', async () => {
    const customerId = new Types.ObjectId();
    const repository = {
      findByCode: jest.fn(async () =>
        voucherDoc({ code: 'WASH-ABC1234567', customer_id: customerId }),
      ),
      claimByCode: jest.fn(),
    };
    const res = await makeService(repository).claimByCode(
      customerId.toString(),
      'WASH-ABC1234567',
    );

    expect(res.code).toBe('WASH-ABC1234567');
    expect(repository.claimByCode).not.toHaveBeenCalled();
  });
});

describe('VoucherService.claimFromCampaignId', () => {
  const customerId = new Types.ObjectId();

  /** Repository that hands out one voucher and reports the customer holds none. */
  const claimableRepository = (campaign: { _id: Types.ObjectId }) => ({
    claimAnyFromCampaign: jest.fn(async () =>
      voucherDoc({ campaign_id: campaign._id, customer_id: customerId }),
    ),
    countByCampaignForCustomer: jest.fn(async () => 0),
    releaseClaim: jest.fn(async () => undefined),
  });

  const claim = (
    campaign: Record<string, unknown> | null,
    repository: Record<string, unknown>,
    loyaltyAccount: Record<string, unknown> | null = null,
  ) =>
    makeService(
      repository,
      { findById: jest.fn(async () => campaign) },
      { findByCustomerId: jest.fn(async () => loyaltyAccount) },
    ).claimFromCampaignId(
      customerId.toString(),
      (campaign?._id as Types.ObjectId | undefined)?.toString() ??
        new Types.ObjectId().toString(),
    );

  it('draws one voucher from the pool without any code being typed', async () => {
    const campaign = campaignDoc();
    const repository = claimableRepository(campaign);

    const res = await claim(campaign, repository);

    expect(repository.claimAnyFromCampaign).toHaveBeenCalledWith(
      campaign._id,
      customerId.toString(),
    );
    expect(res.code).toBeTruthy();
  });

  it('404s a DRAFT campaign, which the public API pretends does not exist', async () => {
    const campaign = campaignDoc({ status: CampaignStatusEnum.DRAFT });
    const repository = { claimAnyFromCampaign: jest.fn() };

    await expect(claim(campaign, repository)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(repository.claimAnyFromCampaign).not.toHaveBeenCalled();
  });

  it('404s an unknown campaign id', async () => {
    await expect(
      claim(null, { claimAnyFromCampaign: jest.fn() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('409s a campaign that is not running', async () => {
    const campaign = campaignDoc({ status: CampaignStatusEnum.PAUSED });
    const repository = { claimAnyFromCampaign: jest.fn() };

    await expect(claim(campaign, repository)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.claimAnyFromCampaign).not.toHaveBeenCalled();
  });

  it('409s an empty pool with its own message, not a generic 404', async () => {
    // The code route flattens everything into one 404 to stop code scraping.
    // A campaign id is published, so there is nothing left to protect and the
    // app can finally distinguish "hết voucher" from "sai mã".
    const campaign = campaignDoc();
    const repository = {
      claimAnyFromCampaign: jest.fn(async () => null),
      countByCampaignForCustomer: jest.fn(async () => 0),
    };

    await expect(claim(campaign, repository)).rejects.toThrow(/hết voucher/i);
  });

  it('409s once the customer has taken their allowance', async () => {
    const campaign = campaignDoc({ max_uses_per_customer: 2 });
    const repository = {
      claimAnyFromCampaign: jest.fn(),
      countByCampaignForCustomer: jest.fn(async () => 2),
    };

    await expect(claim(campaign, repository)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.claimAnyFromCampaign).not.toHaveBeenCalled();
  });

  it('409s a campaign that has spent its budget', async () => {
    // Claiming here would mint a voucher the pricing engine then refuses, which
    // is a worse experience than being told no now.
    const campaign = campaignDoc({
      budget_vnd: 1_000_000,
      redeemed_vnd: 1_000_000,
    });
    const repository = { claimAnyFromCampaign: jest.fn() };

    await expect(claim(campaign, repository)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.claimAnyFromCampaign).not.toHaveBeenCalled();
  });

  it('still claims when the campaign has budget left', async () => {
    const campaign = campaignDoc({
      budget_vnd: 1_000_000,
      redeemed_vnd: 999_999,
    });
    const repository = claimableRepository(campaign);

    await expect(claim(campaign, repository)).resolves.toBeDefined();
  });

  it('403s a customer whose tier is off the whitelist', async () => {
    const campaign = campaignDoc({ allowed_tier_ids: [new Types.ObjectId()] });
    const repository = { claimAnyFromCampaign: jest.fn() };

    await expect(
      claim(campaign, repository, { tier_config_id: new Types.ObjectId() }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repository.claimAnyFromCampaign).not.toHaveBeenCalled();
  });

  it('403s a customer with no loyalty account at all — the gate fails closed', async () => {
    const campaign = campaignDoc({ allowed_tier_ids: [new Types.ObjectId()] });

    await expect(
      claim(campaign, { claimAnyFromCampaign: jest.fn() }, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('claims when the tier IS on the whitelist', async () => {
    const tierId = new Types.ObjectId();
    const campaign = campaignDoc({ allowed_tier_ids: [tierId] });
    const repository = claimableRepository(campaign);

    await expect(
      claim(campaign, repository, { tier_config_id: tierId }),
    ).resolves.toBeDefined();
  });

  it('skips the tier lookup entirely when the campaign is open to everyone', async () => {
    const campaign = campaignDoc({ allowed_tier_ids: [] });
    const findByCustomerId = jest.fn(async () => null);

    await makeService(
      claimableRepository(campaign),
      { findById: jest.fn(async () => campaign) },
      { findByCustomerId },
    ).claimFromCampaignId(customerId.toString(), campaign._id.toString());

    expect(findByCustomerId).not.toHaveBeenCalled();
  });

  it('undoes a claim that raced past the per-customer limit', async () => {
    const campaign = campaignDoc({ max_uses_per_customer: 1 });
    const claimed = voucherDoc({ campaign_id: campaign._id });
    let counted = 0;
    const repository = {
      claimAnyFromCampaign: jest.fn(async () => claimed),
      // 0 before the claim, 2 after — a concurrent request already landed.
      countByCampaignForCustomer: jest.fn(async () =>
        counted++ === 0 ? 0 : 2,
      ),
      releaseClaim: jest.fn(async () => undefined),
    };

    await expect(claim(campaign, repository)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(repository.releaseClaim).toHaveBeenCalledWith(
      claimed._id,
      customerId.toString(),
    );
  });
});

describe('VoucherService.adminRevoke', () => {
  it('writes REVOKED with the acting admin, not EXPIRED', async () => {
    const adminId = new Types.ObjectId();
    const target = voucherDoc();
    const repository = {
      findById: jest.fn(async () => target),
      revoke: jest.fn(
        async (_id: string, reason: string, revokedBy?: Types.ObjectId) =>
          voucherDoc({
            status: VoucherStatusEnum.REVOKED,
            revoked_at: new Date(),
            revoked_by: revokedBy,
            revoke_reason: reason,
          }),
      ),
    };
    const res = await makeService(repository).adminRevoke(
      target._id.toString(),
      'Cấp nhầm khách',
      adminId.toString(),
    );

    expect(res.status).toBe(VoucherStatusEnum.REVOKED);
    expect(res.revokeReason).toBe('Cấp nhầm khách');
    expect(repository.revoke.mock.calls[0][2]).toEqual(adminId);
  });

  it('refuses to revoke a voucher held by an in-flight order', async () => {
    const repository = {
      findById: jest.fn(async () =>
        voucherDoc({ status: VoucherStatusEnum.RESERVED }),
      ),
      revoke: jest.fn(),
    };
    await expect(
      makeService(repository).adminRevoke(
        new Types.ObjectId().toString(),
        'nghi ngờ gian lận',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.revoke).not.toHaveBeenCalled();
  });

  it('refuses to revoke an already-redeemed voucher', async () => {
    const repository = {
      findById: jest.fn(async () =>
        voucherDoc({ status: VoucherStatusEnum.USED }),
      ),
      revoke: jest.fn(),
    };
    await expect(
      makeService(repository).adminRevoke(
        new Types.ObjectId().toString(),
        'nghi ngờ gian lận',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(repository.revoke).not.toHaveBeenCalled();
  });
});

describe('VoucherService.adminStats', () => {
  it('reports revoked separately from expired', async () => {
    const repository = {
      aggregateStats: jest.fn(async () => ({
        total: 10,
        used: 3,
        revoked: 2,
        expired: 1,
        reserved: 1,
        claimed: 2,
        inPool: 1,
      })),
    };
    const stats = await makeService(repository).adminStats();

    expect(stats.revoked).toBe(2);
    expect(stats.expired).toBe(1);
    expect(stats.reserved).toBe(1);
    // Buckets are mutually exclusive, so they must reconcile against the total.
    expect(
      stats.used +
        stats.revoked +
        stats.expired +
        stats.reserved +
        stats.claimed +
        stats.inPool,
    ).toBe(stats.total);
  });
});

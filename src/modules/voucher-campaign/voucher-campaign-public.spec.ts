/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo signatures */
import { Types } from 'mongoose';
import { VoucherCampaignService } from './voucher-campaign.service';
import { NotFoundException } from '../../common/exceptions';
import { VoucherCampaignPublicDto } from '../../shared/voucher-campaign/dto/voucher-campaign-public.dto';
import { BenefitTypeEnum } from '../../shared/voucher-campaign/types/benefit-type.enum';
import { CampaignStatusEnum } from '../../shared/voucher-campaign/types/campaign-status.enum';
import { StackingPolicyEnum } from '../../shared/voucher-campaign/types/stacking-policy.enum';

const tierId = new Types.ObjectId();
const serviceId = new Types.ObjectId();

function campaignDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    // Commercial internals — none of these may reach a customer.
    name: 'tet-2026-winback-internal',
    budget_vnd: 50_000_000,
    redeemed_vnd: 20_500_000,
    redeemed_count: 410,
    max_uses_total: 1000,
    public_claim_code: 'TET2026',
    created_by: new Types.ObjectId(),
    source: 'winback',

    title: 'Giảm 50K mừng Tết 2026',
    description: 'Áp dụng cho mọi gói rửa xe.',
    terms: 'Không áp dụng cùng ưu đãi khác.',
    image_url: 'https://cdn.example.com/tet.png',
    theme_color: '#E4572E',
    status: CampaignStatusEnum.ACTIVE,
    benefit_type: BenefitTypeEnum.FIXED_AMOUNT,
    discount_value: 50_000,
    discount_cap_vnd: undefined,
    min_order_vnd: 150_000,
    valid_from: new Date(Date.now() - 86_400_000),
    valid_until: new Date(Date.now() + 86_400_000),
    stacking_policy: StackingPolicyEnum.WITH_TIER,
    allowed_tier_ids: [tierId],
    applicable_service_type_ids: [serviceId],
    applicable_vehicle_type_ids: [],
    ...over,
  };
}

/**
 * Availability comes from the voucher pool, so every public read now touches
 * the voucher repository. Default the counts to "nothing", which is the shape
 * the projection tests care about; the availability suite below overrides them.
 */
const voucherRepositoryStub = (
  pool = new Map<string, number>(),
  held = new Map<string, number>(),
) => ({
  countInPoolByCampaigns: jest.fn(async () => pool),
  countByCampaignsForCustomer: jest.fn(async () => held),
});

const makeService = (campaign: Record<string, unknown> | null) =>
  new VoucherCampaignService(
    { findById: jest.fn(async () => campaign) } as never,
    voucherRepositoryStub() as never,
    {} as never,
  );

describe('VoucherCampaignPublicDto', () => {
  it('never leaks commercial internals to a customer', async () => {
    const dto = VoucherCampaignPublicDto.fromDocument(campaignDoc() as never);
    const keys = Object.keys(dto);

    // Knowing the remaining budget is an invitation to drain it; echoing back a
    // claim code would let anyone claim from a targeted promotion.
    for (const forbidden of [
      'budgetVnd',
      'redeemedVnd',
      'redeemedCount',
      'maxUsesTotal',
      'publicClaimCode',
      'createdBy',
      'source',
      'name',
    ]) {
      expect(keys).not.toContain(forbidden);
    }
    // And nothing sneaks through as a raw snake_case column either.
    expect(JSON.stringify(dto)).not.toContain('50000000');
    expect(JSON.stringify(dto)).not.toContain('TET2026');
    expect(JSON.stringify(dto)).not.toContain('winback');
  });

  it('carries everything a voucher card needs to render', async () => {
    const dto = VoucherCampaignPublicDto.fromDocument(campaignDoc() as never);

    expect(dto.title).toBe('Giảm 50K mừng Tết 2026');
    expect(dto.description).toBeTruthy();
    expect(dto.terms).toBeTruthy();
    expect(dto.imageUrl).toBeTruthy();
    expect(dto.themeColor).toBe('#E4572E');
    expect(dto.minOrderVnd).toBe(150_000);
    expect(dto.benefitType).toBe(BenefitTypeEnum.FIXED_AMOUNT);
    expect(dto.stackingPolicy).toBe(StackingPolicyEnum.WITH_TIER);
  });

  it('exposes eligibility as plain id arrays for the client to join', async () => {
    const dto = VoucherCampaignPublicDto.fromDocument(campaignDoc() as never);

    expect(dto.allowedTierIds).toEqual([tierId.toString()]);
    expect(dto.applicableServiceTypeIds).toEqual([serviceId.toString()]);
    // Empty means "no restriction" — the client must not read it as "none".
    expect(dto.applicableVehicleTypeIds).toEqual([]);
  });
});

describe('VoucherCampaignService.getPublicById', () => {
  it('returns the safe projection for a live campaign', async () => {
    const dto = await makeService(campaignDoc()).getPublicById(
      new Types.ObjectId().toString(),
    );
    expect(dto.title).toBe('Giảm 50K mừng Tết 2026');
  });

  it('hides a DRAFT campaign behind a 404', async () => {
    // Still being written — its copy must not leak to anyone guessing the id.
    await expect(
      makeService(
        campaignDoc({ status: CampaignStatusEnum.DRAFT }),
      ).getPublicById(new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('still returns a PAUSED campaign so the UI can explain itself', async () => {
    // Silently 404-ing would leave the app unable to say why the voucher in the
    // customer's wallet suddenly stopped working.
    const dto = await makeService(
      campaignDoc({ status: CampaignStatusEnum.PAUSED }),
    ).getPublicById(new Types.ObjectId().toString());

    expect(dto.status).toBe(CampaignStatusEnum.PAUSED);
  });

  it('404s an unknown id', async () => {
    await expect(
      makeService(null).getPublicById(new Types.ObjectId().toString()),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('VoucherCampaignService.listPublic', () => {
  const makeListService = (docs: Array<Record<string, unknown>>) => {
    const findPaginated = jest.fn(async () => docs);
    const count = jest.fn(async () => docs.length);
    const service = new VoucherCampaignService(
      { findPaginated, count } as never,
      voucherRepositoryStub() as never,
      {} as never,
    );
    return { service, findPaginated, count };
  };

  it('defaults to the campaigns running right now, window still open', async () => {
    const { service, findPaginated, count } = makeListService([campaignDoc()]);
    const before = Date.now();

    const result = await service.listPublic(undefined, 1, 20);

    const [filter, page, limit, sort] = findPaginated.mock
      .calls[0] as never as [
      { status: string; windowOpenAt: Date },
      number,
      number,
      Record<string, number>,
    ];
    expect(filter.status).toBe(CampaignStatusEnum.ACTIVE);
    expect(filter.windowOpenAt.getTime()).toBeGreaterThanOrEqual(before);
    // Soonest-ending first — the offer worth acting on leads the page.
    expect(sort).toEqual({ valid_until: 1 });
    expect([page, limit]).toEqual([1, 20]);
    // The same filter must drive the count, or the meta contradicts the data.
    expect(count).toHaveBeenCalledWith(filter);
    expect(result.meta).toEqual({
      page: 1,
      limit: 20,
      total: 1,
      totalPages: 1,
    });
  });

  it('drops the window filter for ended campaigns, which are all past it', async () => {
    const { service, findPaginated } = makeListService([]);

    await service.listPublic(CampaignStatusEnum.ENDED, 1, 20);

    const [filter] = findPaginated.mock.calls[0] as never as [
      { status: string; windowOpenAt?: Date },
    ];
    expect(filter.status).toBe(CampaignStatusEnum.ENDED);
    expect(filter.windowOpenAt).toBeUndefined();
  });

  it('falls back to active rather than ever listing DRAFT campaigns', async () => {
    // The query DTO already rejects `status=draft` with a 400; this is the
    // second lock, for any internal caller that bypasses it.
    const { service, findPaginated } = makeListService([]);

    await service.listPublic(CampaignStatusEnum.DRAFT, 1, 20);

    const [filter] = findPaginated.mock.calls[0] as never as [
      { status: string },
    ];
    expect(filter.status).toBe(CampaignStatusEnum.ACTIVE);
  });

  it('returns the safe projection, never the admin one', async () => {
    const { service } = makeListService([campaignDoc()]);

    const result = await service.listPublic(undefined, 1, 20);

    expect(result.data).toHaveLength(1);
    expect(Object.keys(result.data[0])).not.toContain('budgetVnd');
    expect(JSON.stringify(result.data[0])).not.toContain('TET2026');
  });

  it('reports at least one page when nothing matches', async () => {
    const { service } = makeListService([]);

    const result = await service.listPublic(undefined, 1, 20);

    expect(result.data).toEqual([]);
    expect(result.meta.totalPages).toBe(1);
  });
});

describe('campaign availability', () => {
  const viewerId = new Types.ObjectId().toString();

  const makeService = (
    campaign: Record<string, unknown>,
    pool: number | undefined,
    held?: number,
  ) => {
    const campaignKey = (campaign._id as Types.ObjectId).toString();
    const voucherRepository = voucherRepositoryStub(
      pool === undefined ? new Map() : new Map([[campaignKey, pool]]),
      held === undefined ? new Map() : new Map([[campaignKey, held]]),
    );
    const service = new VoucherCampaignService(
      {
        findById: jest.fn(async () => campaign),
        findPaginated: jest.fn(async () => [campaign]),
        count: jest.fn(async () => 1),
      } as never,
      voucherRepository as never,
      {} as never,
    );
    return { service, voucherRepository };
  };

  it('reports what is left in the pool and that it is not sold out', async () => {
    const { service } = makeService(campaignDoc(), 42);

    const dto = await service.getPublicById(new Types.ObjectId().toString());

    expect(dto.remaining).toBe(42);
    expect(dto.soldOut).toBe(false);
  });

  it('calls a campaign with nothing left in the pool sold out', async () => {
    // A campaign absent from the count map has no claimable vouchers at all.
    const { service } = makeService(campaignDoc(), undefined);

    const dto = await service.getPublicById(new Types.ObjectId().toString());

    expect(dto.remaining).toBe(0);
    expect(dto.soldOut).toBe(true);
  });

  it('omits alreadyClaimed for an anonymous viewer rather than guessing false', async () => {
    // Absent means "unknown". Sending false would make the card invite a claim
    // the customer may in fact have already taken. Asserted on the SERIALIZED
    // payload, which is what the client sees — an undefined class field is
    // still an own property in ES2023, but never survives JSON.stringify.
    const { service, voucherRepository } = makeService(campaignDoc(), 5);

    const dto = await service.getPublicById(new Types.ObjectId().toString());

    expect(JSON.parse(JSON.stringify(dto))).not.toHaveProperty(
      'alreadyClaimed',
    );
    expect(
      voucherRepository.countByCampaignsForCustomer,
    ).not.toHaveBeenCalled();
  });

  it('flags alreadyClaimed once the viewer is at their per-customer cap', async () => {
    const { service } = makeService(
      campaignDoc({ max_uses_per_customer: 2 }),
      5,
      2,
    );

    const dto = await service.getPublicById(
      new Types.ObjectId().toString(),
      viewerId,
    );

    expect(dto.alreadyClaimed).toBe(true);
  });

  it('leaves alreadyClaimed false while the viewer is still under the cap', async () => {
    // Holding one of two is not "đã nhận" — there is a second still to take.
    const { service } = makeService(
      campaignDoc({ max_uses_per_customer: 2 }),
      5,
      1,
    );

    const dto = await service.getPublicById(
      new Types.ObjectId().toString(),
      viewerId,
    );

    expect(dto.alreadyClaimed).toBe(false);
  });

  it('resolves the whole list in two queries, not two per card', async () => {
    const { service, voucherRepository } = makeService(campaignDoc(), 3, 0);

    const result = await service.listPublic(undefined, 1, 20, viewerId);

    expect(result.data[0].remaining).toBe(3);
    expect(result.data[0].alreadyClaimed).toBe(false);
    expect(voucherRepository.countInPoolByCampaigns).toHaveBeenCalledTimes(1);
    expect(voucherRepository.countByCampaignsForCustomer).toHaveBeenCalledTimes(
      1,
    );
  });

  it('leaves availability off a campaign embedded elsewhere', async () => {
    // VoucherResponse embeds this DTO for a voucher already in the wallet; the
    // pool state of its campaign is noise there, so nothing is serialized.
    const dto = VoucherCampaignPublicDto.fromDocument(campaignDoc() as never);
    const wire = JSON.parse(JSON.stringify(dto)) as Record<string, unknown>;

    expect(wire).not.toHaveProperty('remaining');
    expect(wire).not.toHaveProperty('soldOut');
    expect(wire).not.toHaveProperty('alreadyClaimed');
  });
});

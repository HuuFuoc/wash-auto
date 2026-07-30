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

const makeService = (campaign: Record<string, unknown> | null) =>
  new VoucherCampaignService(
    { findById: jest.fn(async () => campaign) } as never,
    {} as never,
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
      {} as never,
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

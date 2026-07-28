/* eslint-disable @typescript-eslint/require-await -- async jest mocks mirror the real async repo signatures */
import { Types } from 'mongoose';
import { DiscountCalculationService } from './discount-calculation.service';
import { VoucherEligibilityService } from './voucher-eligibility.service';
import { VoucherReasonCodeEnum } from '../../shared/pricing/types/voucher-reason-code.enum';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { BenefitTypeEnum } from '../../shared/voucher-campaign/types/benefit-type.enum';
import { CampaignStatusEnum } from '../../shared/voucher-campaign/types/campaign-status.enum';
import { StackingPolicyEnum } from '../../shared/voucher-campaign/types/stacking-policy.enum';

const customerId = new Types.ObjectId();
const serviceTypeId = new Types.ObjectId();
const vehicleTypeId = new Types.ObjectId();
const tierId = new Types.ObjectId();

const SUBTOTAL = 200_000;

function tierDoc(over: Record<string, unknown> = {}) {
  return {
    _id: tierId,
    tier_name: 'Silver',
    discount_percent: 8,
    ...over,
  };
}

function voucherDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    campaign_id: undefined,
    customer_id: customerId,
    code: 'WASH-4KP9XM2A7B',
    status: VoucherStatusEnum.UNUSED,
    discount_cap_vnd: 50_000,
    expires_at: new Date(Date.now() + 86_400_000),
    ...over,
  };
}

function campaignDoc(over: Record<string, unknown> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'test',
    status: CampaignStatusEnum.ACTIVE,
    benefit_type: BenefitTypeEnum.FIXED_AMOUNT,
    discount_value: 50_000,
    discount_cap_vnd: undefined,
    min_order_vnd: 0,
    valid_from: new Date(Date.now() - 86_400_000),
    valid_until: new Date(Date.now() + 86_400_000),
    stacking_policy: StackingPolicyEnum.WITH_TIER_AND_PROMOTION,
    max_uses_per_customer: 1,
    allowed_tier_ids: [],
    applicable_service_type_ids: [],
    applicable_vehicle_type_ids: [],
    ...over,
  };
}

/** Engine wired to stub repositories returning the given voucher + campaign. */
function makeEngine(
  voucher: Record<string, unknown> | null,
  campaign: Record<string, unknown> | null = null,
  heldByCustomer = 1,
) {
  const voucherRepository = {
    findById: jest.fn(async () => voucher),
    countByCampaignForCustomer: jest.fn(async () => heldByCustomer),
  };
  const campaignRepository = { findById: jest.fn(async () => campaign) };
  return new DiscountCalculationService(
    new VoucherEligibilityService(
      voucherRepository as never,
      campaignRepository as never,
    ),
  );
}

function baseInput(over: Record<string, unknown> = {}) {
  return {
    customerId: customerId.toString(),
    tier: tierDoc() as never,
    serviceTypeId,
    vehicleTypeId,
    serviceAcceptsVouchers: true,
    subtotalVnd: SUBTOTAL,
    windowDiscountPercent: 0,
    maxStackedPercent: 30,
    ...over,
  };
}

describe('DiscountCalculationService — no voucher', () => {
  it('applies nothing outside a golden hour, matching the pre-campaign rule', async () => {
    const res = await makeEngine(null).calculate(baseInput());

    expect(res.totalDiscountVnd).toBe(0);
    expect(res.finalTotalVnd).toBe(SUBTOTAL);
    expect(res.tierDiscountVnd).toBe(0);
    expect(res.voucherAccepted).toBe(true);
  });

  it('stacks golden hour and tier inside a window, capped by policy', async () => {
    // window 10 + tier 8 = 18, under the 30 cap.
    const res = await makeEngine(null).calculate(
      baseInput({ windowDiscountPercent: 10 }),
    );

    expect(res.promotionDiscountVnd + res.tierDiscountVnd).toBe(
      Math.round((SUBTOTAL * 18) / 100),
    );
    expect(res.isGoldenHour).toBe(true);
  });

  it('honours the pricing-policy cap when the components exceed it', async () => {
    const res = await makeEngine(null).calculate(
      baseInput({ windowDiscountPercent: 40, maxStackedPercent: 30 }),
    );

    expect(res.totalDiscountVnd).toBe(Math.round((SUBTOTAL * 30) / 100));
  });
});

describe('DiscountCalculationService — benefit types', () => {
  it('FIXED_AMOUNT below the total takes exactly its value', async () => {
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({ discount_value: 50_000 }),
    );
    const res = await engine.calculate(baseInput({ voucherId: 'v1' }));

    expect(res.voucherDiscountVnd).toBe(50_000);
    expect(res.finalTotalVnd).toBe(SUBTOTAL - 50_000);
  });

  it('FIXED_AMOUNT above the total is clamped, never negative', async () => {
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({ discount_value: 500_000 }),
    );
    const res = await engine.calculate(baseInput({ voucherId: 'v1' }));

    expect(res.voucherDiscountVnd).toBe(SUBTOTAL);
    expect(res.finalTotalVnd).toBe(0);
    expect(res.totalDiscountVnd).toBe(SUBTOTAL);
  });

  it('PERCENT_OFF without a cap takes the full percentage', async () => {
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({
        benefit_type: BenefitTypeEnum.PERCENT_OFF,
        discount_value: 25,
      }),
    );
    const res = await engine.calculate(baseInput({ voucherId: 'v1' }));

    expect(res.voucherDiscountVnd).toBe(50_000); // 25% of 200k
  });

  it('PERCENT_OFF is limited by discountCapVnd when one is set', async () => {
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({
        benefit_type: BenefitTypeEnum.PERCENT_OFF,
        discount_value: 50,
        discount_cap_vnd: 30_000,
      }),
    );
    const res = await engine.calculate(baseInput({ voucherId: 'v1' }));

    expect(res.voucherDiscountVnd).toBe(30_000); // capped down from 100k
  });

  it('FREE_SERVICE covers whatever is left on the order', async () => {
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({
        benefit_type: BenefitTypeEnum.FREE_SERVICE,
        applicable_service_type_ids: [serviceTypeId],
      }),
    );
    const res = await engine.calculate(baseInput({ voucherId: 'v1' }));

    expect(res.finalTotalVnd).toBe(0);
    expect(res.voucherDiscountVnd).toBe(SUBTOTAL);
  });

  it('rounds percentages to whole VND, never emitting a fraction', async () => {
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({
        benefit_type: BenefitTypeEnum.PERCENT_OFF,
        discount_value: 33,
      }),
    );
    const res = await engine.calculate(
      baseInput({ voucherId: 'v1', subtotalVnd: 99_999 }),
    );

    expect(Number.isInteger(res.voucherDiscountVnd)).toBe(true);
    expect(Number.isInteger(res.finalTotalVnd)).toBe(true);
    expect(res.voucherDiscountVnd).toBe(Math.round((99_999 * 33) / 100));
  });

  it('keeps the components summing to the reported total', async () => {
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({ discount_value: 40_000 }),
    );
    const res = await engine.calculate(
      baseInput({ voucherId: 'v1', windowDiscountPercent: 10 }),
    );

    expect(
      res.promotionDiscountVnd + res.tierDiscountVnd + res.voucherDiscountVnd,
    ).toBe(res.totalDiscountVnd);
    expect(res.finalTotalVnd).toBe(res.subtotalVnd - res.totalDiscountVnd);
  });
});

describe('DiscountCalculationService — stacking policy', () => {
  const cases: Array<[StackingPolicyEnum, number, number]> = [
    // policy, expected promotion %, expected tier %
    [StackingPolicyEnum.NONE, 0, 0],
    [StackingPolicyEnum.WITH_TIER, 0, 8],
    [StackingPolicyEnum.WITH_PROMOTION, 10, 0],
    [StackingPolicyEnum.WITH_TIER_AND_PROMOTION, 10, 8],
  ];

  it.each(cases)(
    '%s yields promotion=%i%% tier=%i%%',
    async (policy, promoPct, tierPct) => {
      const engine = makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ stacking_policy: policy, discount_value: 10_000 }),
      );
      const res = await engine.calculate(
        baseInput({ voucherId: 'v1', windowDiscountPercent: 10 }),
      );

      expect(res.promotionDiscountVnd).toBe(
        Math.round((SUBTOTAL * promoPct) / 100),
      );
      expect(res.tierDiscountVnd).toBe(Math.round((SUBTOTAL * tierPct) / 100));
      // The voucher itself always applies regardless of the policy.
      expect(res.voucherDiscountVnd).toBe(10_000);
    },
  );

  it('does not reprice outside a golden hour even under WITH_TIER', async () => {
    // Tier has never paid out outside a window; campaigns must not change that.
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({
        stacking_policy: StackingPolicyEnum.WITH_TIER,
        discount_value: 10_000,
      }),
    );
    const res = await engine.calculate(
      baseInput({ voucherId: 'v1', windowDiscountPercent: 0 }),
    );

    expect(res.tierDiscountVnd).toBe(0);
    expect(res.promotionDiscountVnd).toBe(0);
    expect(res.totalDiscountVnd).toBe(10_000);
  });
});

describe('DiscountCalculationService — eligibility refusals', () => {
  const expectRefusal = async (
    engine: DiscountCalculationService,
    code: VoucherReasonCodeEnum,
  ) => {
    const res = await engine.calculate(baseInput({ voucherId: 'v1' }));
    expect(res.voucherAccepted).toBe(false);
    expect(res.invalidReasonCode).toBe(code);
    expect(res.invalidReasonMessage).toBeTruthy();
    // A refused voucher must not disturb the rest of the pricing.
    expect(res.voucherDiscountVnd).toBe(0);
    return res;
  };

  it('reports VOUCHER_NOT_FOUND for an unknown id', async () => {
    await expectRefusal(
      makeEngine(null),
      VoucherReasonCodeEnum.VOUCHER_NOT_FOUND,
    );
  });

  it('reports VOUCHER_NOT_OWNED for someone else voucher', async () => {
    await expectRefusal(
      makeEngine(voucherDoc({ customer_id: new Types.ObjectId() })),
      VoucherReasonCodeEnum.VOUCHER_NOT_OWNED,
    );
  });

  it('reports VOUCHER_ALREADY_USED', async () => {
    await expectRefusal(
      makeEngine(voucherDoc({ status: VoucherStatusEnum.USED })),
      VoucherReasonCodeEnum.VOUCHER_ALREADY_USED,
    );
  });

  it('reports VOUCHER_REVOKED separately from expired', async () => {
    await expectRefusal(
      makeEngine(voucherDoc({ status: VoucherStatusEnum.REVOKED })),
      VoucherReasonCodeEnum.VOUCHER_REVOKED,
    );
  });

  it('reports VOUCHER_RESERVED when held for another order', async () => {
    await expectRefusal(
      makeEngine(
        voucherDoc({
          status: VoucherStatusEnum.RESERVED,
          reserved_order_id: new Types.ObjectId(),
        }),
      ),
      VoucherReasonCodeEnum.VOUCHER_RESERVED,
    );
  });

  it('accepts a voucher reserved for the very order being priced', async () => {
    const orderId = new Types.ObjectId();
    const engine = makeEngine(
      voucherDoc({
        status: VoucherStatusEnum.RESERVED,
        reserved_order_id: orderId,
      }),
    );
    const res = await engine.calculate(
      baseInput({ voucherId: 'v1', forOrderId: orderId }),
    );

    expect(res.voucherAccepted).toBe(true);
  });

  it('reports VOUCHER_EXPIRED past the deadline', async () => {
    await expectRefusal(
      makeEngine(voucherDoc({ expires_at: new Date(Date.now() - 1000) })),
      VoucherReasonCodeEnum.VOUCHER_EXPIRED,
    );
  });

  it('reports CAMPAIGN_NOT_ACTIVE for a paused campaign', async () => {
    await expectRefusal(
      makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ status: CampaignStatusEnum.PAUSED }),
      ),
      VoucherReasonCodeEnum.CAMPAIGN_NOT_ACTIVE,
    );
  });

  it('reports CAMPAIGN_NOT_ACTIVE for an ended campaign', async () => {
    await expectRefusal(
      makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ status: CampaignStatusEnum.ENDED }),
      ),
      VoucherReasonCodeEnum.CAMPAIGN_NOT_ACTIVE,
    );
  });

  it('reports VOUCHER_NOT_ACTIVE before validFrom', async () => {
    await expectRefusal(
      makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ valid_from: new Date(Date.now() + 86_400_000) }),
      ),
      VoucherReasonCodeEnum.VOUCHER_NOT_ACTIVE,
    );
  });

  it('reports TIER_NOT_ELIGIBLE when the tier is off the whitelist', async () => {
    const res = await expectRefusal(
      makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ allowed_tier_ids: [new Types.ObjectId()] }),
      ),
      VoucherReasonCodeEnum.TIER_NOT_ELIGIBLE,
    );
    // The message names the customer's actual tier so the UI can explain it.
    expect(res.invalidReasonMessage).toContain('Silver');
  });

  it('accepts when the tier IS on the whitelist', async () => {
    const engine = makeEngine(
      voucherDoc({ campaign_id: new Types.ObjectId() }),
      campaignDoc({ allowed_tier_ids: [tierId] }),
    );
    const res = await engine.calculate(baseInput({ voucherId: 'v1' }));

    expect(res.voucherAccepted).toBe(true);
  });

  it('reports SERVICE_NOT_ELIGIBLE when the service is off the whitelist', async () => {
    await expectRefusal(
      makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ applicable_service_type_ids: [new Types.ObjectId()] }),
      ),
      VoucherReasonCodeEnum.SERVICE_NOT_ELIGIBLE,
    );
  });

  it('reports VEHICLE_NOT_ELIGIBLE when the vehicle is off the whitelist', async () => {
    await expectRefusal(
      makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ applicable_vehicle_type_ids: [new Types.ObjectId()] }),
      ),
      VoucherReasonCodeEnum.VEHICLE_NOT_ELIGIBLE,
    );
  });

  it('reports ORDER_BELOW_MINIMUM with both figures in the message', async () => {
    const res = await expectRefusal(
      makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ min_order_vnd: 500_000 }),
      ),
      VoucherReasonCodeEnum.ORDER_BELOW_MINIMUM,
    );
    expect(res.invalidReasonMessage).toContain('500.000');
  });

  it('reports USAGE_LIMIT_REACHED when the customer holds more than allowed', async () => {
    await expectRefusal(
      makeEngine(
        voucherDoc({ campaign_id: new Types.ObjectId() }),
        campaignDoc({ max_uses_per_customer: 1 }),
        3, // holds three from a one-per-customer campaign
      ),
      VoucherReasonCodeEnum.USAGE_LIMIT_REACHED,
    );
  });

  it('still gives the golden-hour and tier discount when the voucher is refused', async () => {
    const engine = makeEngine(voucherDoc({ status: VoucherStatusEnum.USED }));
    const res = await engine.calculate(
      baseInput({ voucherId: 'v1', windowDiscountPercent: 10 }),
    );

    expect(res.voucherAccepted).toBe(false);
    expect(res.totalDiscountVnd).toBe(Math.round((SUBTOTAL * 18) / 100));
  });
});

describe('DiscountCalculationService — legacy vouchers with no campaign', () => {
  it('falls back to the voucher cap, matching pre-campaign behaviour', async () => {
    const engine = makeEngine(voucherDoc({ discount_cap_vnd: 30_000 }));
    const res = await engine.calculate(baseInput({ voucherId: 'v1' }));

    expect(res.voucherAccepted).toBe(true);
    expect(res.voucherDiscountVnd).toBe(30_000);
  });

  it('still respects the global service voucher flag', async () => {
    const engine = makeEngine(voucherDoc());
    const res = await engine.calculate(
      baseInput({ voucherId: 'v1', serviceAcceptsVouchers: false }),
    );

    expect(res.voucherAccepted).toBe(false);
    expect(res.invalidReasonCode).toBe(
      VoucherReasonCodeEnum.SERVICE_NOT_ELIGIBLE,
    );
  });
});

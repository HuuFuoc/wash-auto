import { ClientSession, Types } from 'mongoose';
import { CampaignStatusEnum } from '../../shared/voucher-campaign/types/campaign-status.enum';
import {
  VoucherCampaign,
  VoucherCampaignDocument,
  VoucherCampaignModel,
} from './voucher-campaign.model';

/**
 * Everything a campaign needs at creation time. `status` and the spend counters
 * are omitted because the schema defaults them — a caller has no business
 * seeding a campaign that has already spent money.
 */
export type ICreateCampaignInput = Omit<
  VoucherCampaign,
  'status' | 'redeemed_count' | 'redeemed_vnd'
> & {
  status?: CampaignStatusEnum;
};

/**
 * Editable subset. Status moves only through the lifecycle transitions, and the
 * counters only through `incrementRedeemed` / `setRedeemedCounters`.
 */
export type IUpdateCampaignInput = Partial<
  Omit<VoucherCampaign, 'status' | 'redeemed_count' | 'redeemed_vnd'>
>;

export interface ICampaignListFilter {
  status?: CampaignStatusEnum;
  source?: string;
  /**
   * Keeps campaigns whose window is still open at this instant. The lifecycle
   * sweep only runs periodically, so an ACTIVE row can sit a few minutes past
   * `valid_until` — the public list must not advertise it in that gap.
   */
  windowOpenAt?: Date;
}

/** Mongo sort spec. Newest first is the default for every list. */
export type CampaignSort = Record<string, 1 | -1>;
const DEFAULT_SORT: CampaignSort = { created_at: -1 };

export class VoucherCampaignRepository {
  async create(input: ICreateCampaignInput): Promise<VoucherCampaignDocument> {
    return VoucherCampaignModel.create({
      ...input,
      status: input.status ?? CampaignStatusEnum.DRAFT,
    });
  }

  async findById(
    id: Types.ObjectId | string,
  ): Promise<VoucherCampaignDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherCampaignModel.findById(id).exec();
  }

  /** Bulk fetch for list endpoints that must show a campaign per voucher. */
  async findByIds(
    ids: Array<Types.ObjectId | string>,
  ): Promise<VoucherCampaignDocument[]> {
    const valid = ids.filter((id) => Types.ObjectId.isValid(id));
    if (valid.length === 0) return [];
    return VoucherCampaignModel.find({ _id: { $in: valid } }).exec();
  }

  /**
   * Resolves the campaign a customer is trying to claim from.
   *
   * This replaces parsing the voucher code with a regex: the claim code is a
   * stored, indexed, unique column, so a campaign can rename its codes without
   * breaking claims and two campaigns can never fight over the same prefix.
   */
  async findByPublicClaimCode(
    code: string,
  ): Promise<VoucherCampaignDocument | null> {
    return VoucherCampaignModel.findOne({ public_claim_code: code }).exec();
  }

  async findByName(name: string): Promise<VoucherCampaignDocument | null> {
    return VoucherCampaignModel.findOne({ name }).exec();
  }

  async findPaginated(
    filter: ICampaignListFilter,
    page: number,
    limit: number,
    sort: CampaignSort = DEFAULT_SORT,
  ): Promise<VoucherCampaignDocument[]> {
    return VoucherCampaignModel.find(buildQuery(filter))
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }

  async count(filter: ICampaignListFilter): Promise<number> {
    return VoucherCampaignModel.countDocuments(buildQuery(filter)).exec();
  }

  async update(
    id: Types.ObjectId | string,
    input: IUpdateCampaignInput,
  ): Promise<VoucherCampaignDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherCampaignModel.findByIdAndUpdate(
      id,
      { $set: input },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Moves a campaign to `next` only from one of `allowedFrom`. The compare-and-
   * set is what keeps two admins clicking Activate and End at the same moment
   * from producing a campaign that is both.
   */
  async transitionStatus(
    id: Types.ObjectId | string,
    allowedFrom: CampaignStatusEnum[],
    next: CampaignStatusEnum,
  ): Promise<VoucherCampaignDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherCampaignModel.findOneAndUpdate(
      { _id: id, status: { $in: allowedFrom } },
      { $set: { status: next } },
      { returnDocument: 'after' },
    ).exec();
  }

  /**
   * Moves the cached spend counters. Called with a positive delta when a
   * redemption is applied and a negative one when an applied redemption is
   * undone, always as a single atomic `$inc` so concurrent redemptions cannot
   * lose an update to a read-modify-write.
   */
  async incrementRedeemed(
    id: Types.ObjectId | string,
    countDelta: number,
    vndDelta: number,
    session?: ClientSession,
  ): Promise<void> {
    if (!Types.ObjectId.isValid(id)) return;
    await VoucherCampaignModel.updateOne(
      { _id: id },
      { $inc: { redeemed_count: countDelta, redeemed_vnd: vndDelta } },
      { session },
    ).exec();
  }

  /** Overwrites the counters with reconciled values from the redemption rows. */
  async setRedeemedCounters(
    id: Types.ObjectId | string,
    count: number,
    vnd: number,
  ): Promise<VoucherCampaignDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return VoucherCampaignModel.findByIdAndUpdate(
      id,
      { $set: { redeemed_count: count, redeemed_vnd: vnd } },
      { returnDocument: 'after' },
    ).exec();
  }

  /** Every campaign, for the reconciliation sweep. */
  async findAll(): Promise<VoucherCampaignDocument[]> {
    return VoucherCampaignModel.find().exec();
  }

  /**
   * Flips SCHEDULED campaigns whose start time has arrived to ACTIVE, and ACTIVE
   * campaigns past their end to ENDED. Idempotent: the filters exclude rows
   * already in the target state, so re-running changes nothing.
   */
  async sweepLifecycle(now: Date): Promise<{ started: number; ended: number }> {
    const [started, ended] = await Promise.all([
      VoucherCampaignModel.updateMany(
        {
          status: CampaignStatusEnum.SCHEDULED,
          valid_from: { $lte: now },
          valid_until: { $gt: now },
        },
        { $set: { status: CampaignStatusEnum.ACTIVE } },
      ).exec(),
      VoucherCampaignModel.updateMany(
        {
          status: {
            $in: [CampaignStatusEnum.ACTIVE, CampaignStatusEnum.SCHEDULED],
          },
          valid_until: { $lte: now },
        },
        { $set: { status: CampaignStatusEnum.ENDED } },
      ).exec(),
    ]);
    return {
      started: started.modifiedCount ?? 0,
      ended: ended.modifiedCount ?? 0,
    };
  }
}

function buildQuery(filter: ICampaignListFilter): Record<string, unknown> {
  const query: Record<string, unknown> = {};
  if (filter.status) query.status = filter.status;
  if (filter.source) query.source = filter.source;
  if (filter.windowOpenAt) query.valid_until = { $gt: filter.windowOpenAt };
  return query;
}

import { Types } from 'mongoose';
import { FeedbackDocument, FeedbackModel } from './feedback.model';

export interface IUpsertFeedbackInput {
  orderId: Types.ObjectId;
  workOrderId: Types.ObjectId;
  customerId: Types.ObjectId;
  washerId: Types.ObjectId;
  rating: number;
  comment?: string;
}

export interface IFeedbackListFilter {
  washerId?: Types.ObjectId;
  orderId?: Types.ObjectId;
}

export interface IWasherFeedbackSummary {
  averageRating: number;
  count: number;
  distribution: Record<string, number>;
}

type FeedbackQuery = {
  washer_id?: Types.ObjectId;
  order_id?: Types.ObjectId;
};

export class FeedbackRepository {
  /** Create or update the single feedback for an order (unique order_id). */
  async upsertByOrder(input: IUpsertFeedbackInput): Promise<FeedbackDocument> {
    const set: Record<string, unknown> = {
      work_order_id: input.workOrderId,
      customer_id: input.customerId,
      washer_id: input.washerId,
      rating: input.rating,
    };
    const update: Record<string, unknown> = { $set: set };
    if (input.comment !== undefined) {
      set.comment = input.comment;
    } else {
      update.$unset = { comment: '' };
    }

    const doc = await FeedbackModel.findOneAndUpdate(
      { order_id: input.orderId },
      update,
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return doc;
  }

  async findByOrderId(
    orderId: Types.ObjectId | string,
  ): Promise<FeedbackDocument | null> {
    if (!Types.ObjectId.isValid(orderId)) return null;
    return FeedbackModel.findOne({ order_id: orderId }).exec();
  }

  /** Map of order_id → the rating the customer gave that order (if any). */
  async ratingByOrderIds(
    orderIds: Array<Types.ObjectId | string>,
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (orderIds.length === 0) return map;
    const rows = await FeedbackModel.find({ order_id: { $in: orderIds } })
      .select({ order_id: 1, rating: 1 })
      .exec();
    for (const r of rows) map.set(r.order_id.toString(), r.rating);
    return map;
  }

  async findByCustomer(
    customerId: Types.ObjectId | string,
    page: number,
    limit: number,
  ): Promise<FeedbackDocument[]> {
    const skip = (page - 1) * limit;
    return FeedbackModel.find({ customer_id: new Types.ObjectId(customerId) })
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('washer_id', 'name')
      .exec();
  }

  async countByCustomer(customerId: Types.ObjectId | string): Promise<number> {
    return FeedbackModel.countDocuments({
      customer_id: new Types.ObjectId(customerId),
    }).exec();
  }

  async findPaginated(
    filter: IFeedbackListFilter,
    page: number,
    limit: number,
  ): Promise<FeedbackDocument[]> {
    const skip = (page - 1) * limit;
    return FeedbackModel.find(this.buildQuery(filter))
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit)
      .populate('washer_id', 'name')
      .populate('customer_id', 'name')
      .exec();
  }

  async countMatching(filter: IFeedbackListFilter): Promise<number> {
    return FeedbackModel.countDocuments(this.buildQuery(filter)).exec();
  }

  /** Mean rating, total count, and per-star distribution for one washer. */
  async summaryByWasher(
    washerId: Types.ObjectId | string,
  ): Promise<IWasherFeedbackSummary> {
    const distribution: Record<string, number> = {
      '1': 0,
      '2': 0,
      '3': 0,
      '4': 0,
      '5': 0,
    };
    if (!Types.ObjectId.isValid(washerId)) {
      return { averageRating: 0, count: 0, distribution };
    }
    const rows = await FeedbackModel.aggregate<{ _id: number; count: number }>([
      { $match: { washer_id: new Types.ObjectId(washerId) } },
      { $group: { _id: '$rating', count: { $sum: 1 } } },
    ]).exec();

    let total = 0;
    let weighted = 0;
    for (const row of rows) {
      const star = String(row._id);
      if (star in distribution) distribution[star] = row.count;
      total += row.count;
      weighted += row._id * row.count;
    }
    const averageRating =
      total > 0 ? Math.round((weighted / total) * 10) / 10 : 0;
    return { averageRating, count: total, distribution };
  }

  private buildQuery(filter: IFeedbackListFilter): FeedbackQuery {
    const q: FeedbackQuery = {};
    if (filter.washerId) q.washer_id = filter.washerId;
    if (filter.orderId) q.order_id = filter.orderId;
    return q;
  }

  /** Feedback count + mean rating per washer, for the shift/performance tab. */
  async summaryByWashers(
    washerIds: Array<Types.ObjectId | string>,
  ): Promise<Map<string, { count: number; averageRating: number }>> {
    const result = new Map<string, { count: number; averageRating: number }>();
    if (washerIds.length === 0) return result;
    const rows = await FeedbackModel.aggregate<{
      _id: Types.ObjectId;
      count: number;
      avg: number;
    }>([
      {
        $match: {
          washer_id: { $in: washerIds.map((w) => new Types.ObjectId(w)) },
        },
      },
      {
        $group: {
          _id: '$washer_id',
          count: { $sum: 1 },
          avg: { $avg: '$rating' },
        },
      },
    ]).exec();
    for (const row of rows) {
      result.set(row._id.toString(), {
        count: row.count,
        averageRating: Math.round(row.avg * 10) / 10,
      });
    }
    return result;
  }
}

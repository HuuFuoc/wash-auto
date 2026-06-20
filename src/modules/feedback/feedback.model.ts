import { HydratedDocument, Schema, Types, model } from 'mongoose';

/**
 * Customer feedback for a completed order, attributed to the washer who did the
 * job. Replaces manager QC as the quality signal. One feedback per order
 * (unique order_id); resubmitting updates the existing rating/comment.
 */
export interface Feedback {
  order_id: Types.ObjectId;
  work_order_id: Types.ObjectId;
  customer_id: Types.ObjectId;
  washer_id: Types.ObjectId;
  rating: number;
  comment?: string;
}

export type FeedbackDocument = HydratedDocument<Feedback>;

const feedbackSchema = new Schema<Feedback>(
  {
    order_id: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      unique: true,
      index: true,
    },
    work_order_id: {
      type: Schema.Types.ObjectId,
      ref: 'WorkOrder',
      required: true,
    },
    customer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    washer_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: { type: Number, required: true, min: 1, max: 5 },
    comment: { type: String, trim: true, maxlength: 1000 },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'feedbacks',
  },
);

feedbackSchema.index({ washer_id: 1, created_at: -1 });
feedbackSchema.index({ customer_id: 1, created_at: -1 });

export const FeedbackModel = model<Feedback>('Feedback', feedbackSchema);

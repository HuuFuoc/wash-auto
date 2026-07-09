import { HydratedDocument, Schema, Types, model } from 'mongoose';
import { NotificationTypeEnum } from '../../shared/notification/types/notification-type.enum';

/**
 * Một thông báo thuộc về một người dùng. Được ghi khi có sự kiện (đơn mới,
 * xe được giao/rửa xong, feedback...) rồi đẩy realtime qua socket. Lưu DB để
 * còn lịch sử + đếm số chưa đọc sau khi tải lại trang.
 */
export interface Notification {
  user_id: Types.ObjectId;
  type: NotificationTypeEnum;
  title: string;
  body: string;
  /** Ngữ cảnh để FE điều hướng (vd { orderId, workOrderId, plate }). */
  data?: Record<string, unknown>;
  is_read: boolean;
}

export type NotificationDocument = HydratedDocument<Notification>;

const notificationSchema = new Schema<Notification>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      required: true,
      enum: Object.values(NotificationTypeEnum),
    },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed },
    is_read: { type: Boolean, default: false, index: true },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    collection: 'notifications',
  },
);

// Truy vấn chính: thông báo mới nhất của 1 user + đếm chưa đọc.
notificationSchema.index({ user_id: 1, created_at: -1 });
notificationSchema.index({ user_id: 1, is_read: 1 });

export const NotificationModel = model<Notification>(
  'Notification',
  notificationSchema,
);

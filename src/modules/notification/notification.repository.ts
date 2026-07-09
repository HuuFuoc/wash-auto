import { Types } from 'mongoose';
import { NotificationTypeEnum } from '../../shared/notification/types/notification-type.enum';
import { NotificationDocument, NotificationModel } from './notification.model';

export interface ICreateNotificationInput {
  userId: Types.ObjectId | string;
  type: NotificationTypeEnum;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export class NotificationRepository {
  async create(input: ICreateNotificationInput): Promise<NotificationDocument> {
    return NotificationModel.create({
      user_id: new Types.ObjectId(input.userId),
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
      is_read: false,
    });
  }

  /** Ghi cùng một thông báo cho nhiều người (fan-out theo vai trò). */
  async createMany(
    userIds: Array<Types.ObjectId | string>,
    input: Omit<ICreateNotificationInput, 'userId'>,
  ): Promise<NotificationDocument[]> {
    if (userIds.length === 0) return [];
    const docs = userIds.map((id) => ({
      user_id: new Types.ObjectId(id),
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data,
      is_read: false,
    }));
    return NotificationModel.insertMany(docs);
  }

  async listByUser(
    userId: Types.ObjectId | string,
    page: number,
    limit: number,
  ): Promise<NotificationDocument[]> {
    return NotificationModel.find({ user_id: new Types.ObjectId(userId) })
      .sort({ created_at: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec();
  }

  async countByUser(userId: Types.ObjectId | string): Promise<number> {
    return NotificationModel.countDocuments({
      user_id: new Types.ObjectId(userId),
    }).exec();
  }

  async countUnread(userId: Types.ObjectId | string): Promise<number> {
    return NotificationModel.countDocuments({
      user_id: new Types.ObjectId(userId),
      is_read: false,
    }).exec();
  }

  /** Đánh dấu đã đọc 1 thông báo (chỉ của chính chủ). */
  async markRead(
    id: Types.ObjectId | string,
    userId: Types.ObjectId | string,
  ): Promise<NotificationDocument | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    return NotificationModel.findOneAndUpdate(
      { _id: id, user_id: new Types.ObjectId(userId) },
      { $set: { is_read: true } },
      { returnDocument: 'after' },
    ).exec();
  }

  async markAllRead(userId: Types.ObjectId | string): Promise<number> {
    const res = await NotificationModel.updateMany(
      { user_id: new Types.ObjectId(userId), is_read: false },
      { $set: { is_read: true } },
    ).exec();
    return res.modifiedCount ?? 0;
  }
}

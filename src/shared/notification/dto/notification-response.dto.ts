import { NotificationTypeEnum } from '../types/notification-type.enum';
import { NotificationDocument } from '../../../modules/notification/notification.model';

export class NotificationResponseDto {
  id: string;
  type: NotificationTypeEnum;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;

  static fromDocument(doc: NotificationDocument): NotificationResponseDto {
    const dto = new NotificationResponseDto();
    dto.id = doc._id.toString();
    dto.type = doc.type;
    dto.title = doc.title;
    dto.body = doc.body;
    dto.data = doc.data;
    dto.isRead = doc.is_read;
    dto.createdAt = (doc as unknown as { created_at: Date }).created_at;
    return dto;
  }
}

import { RoleEnum } from '../../shared/auth/types/role.enum';
import { NotificationTypeEnum } from '../../shared/notification/types/notification-type.enum';
import { NotificationResponseDto } from '../../shared/notification/dto/notification-response.dto';
import { RealtimeEvent, emitToUser } from '../../core/realtime';
import { redisClient } from '../../core/redis';
import { RoleRepository } from '../auth/role.repository';
import { UserRepository } from '../auth/user.repository';
import { NotificationRepository } from './notification.repository';

interface NotifyInput {
  type: NotificationTypeEnum;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/** Long enough that a yearly reminder cannot fire twice in the same season. */
const DEFAULT_DEDUPE_TTL_SECONDS = 60 * 60 * 24 * 90;

export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly userRepository: UserRepository,
    private readonly roleRepository: RoleRepository,
  ) {}

  // ---------- tạo thông báo (persist + emit) ----------

  /** Thông báo cho 1 người dùng cụ thể. Best-effort: không làm hỏng flow gọi. */
  async notifyUser(userId: string, input: NotifyInput): Promise<void> {
    try {
      const doc = await this.repository.create({ userId, ...input });
      emitToUser(
        userId,
        RealtimeEvent.NOTIFICATION_NEW,
        NotificationResponseDto.fromDocument(doc),
      );
    } catch (err) {
      console.warn(
        `notifyUser failed userId=${userId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  /**
   * Như `notifyUser`, nhưng chỉ gửi MỘT LẦN cho mỗi `dedupeKey`.
   *
   * Các job định kỳ (nhắc voucher sắp hết hạn, cảnh báo reset hạng) chạy lại
   * nhiều lần theo thiết kế — idempotent là yêu cầu bắt buộc. Khoá đặt trong
   * Redis bằng SETNX với TTL, cùng cơ chế mà webhook PayOS và idempotency
   * middleware đang dùng.
   *
   * Redis lỗi → vẫn gửi. Trùng một thông báo còn hơn im lặng.
   */
  async notifyUserOnce(
    userId: string,
    dedupeKey: string,
    input: NotifyInput,
    ttlSeconds = DEFAULT_DEDUPE_TTL_SECONDS,
  ): Promise<boolean> {
    const key = `notif:once:${userId}:${dedupeKey}`;
    try {
      const claimed = await redisClient.set(key, '1', 'EX', ttlSeconds, 'NX');
      if (claimed === null) return false;
    } catch (err) {
      console.warn(
        `notification dedupe check failed key=${key}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
    await this.notifyUser(userId, input);
    return true;
  }

  /** Thông báo cho mọi người dùng đang hoạt động thuộc các vai trò đã cho. */
  async notifyRoles(roles: RoleEnum[], input: NotifyInput): Promise<void> {
    try {
      const userIds: string[] = [];
      for (const roleCode of roles) {
        const role = await this.roleRepository.findByCode(roleCode);
        if (!role) continue;
        const ids = await this.userRepository.findActiveIdsByRoleId(role._id);
        for (const id of ids) userIds.push(id.toString());
      }
      const unique = [...new Set(userIds)];
      const docs = await this.repository.createMany(unique, input);
      for (const doc of docs) {
        emitToUser(
          doc.user_id.toString(),
          RealtimeEvent.NOTIFICATION_NEW,
          NotificationResponseDto.fromDocument(doc),
        );
      }
    } catch (err) {
      console.warn(
        `notifyRoles failed roles=${roles.join(',')}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }

  // ---------- đọc / đánh dấu ----------

  async list(
    userId: string,
    page: number,
    limit: number,
  ): Promise<{
    data: NotificationResponseDto[];
    unread: number;
    meta: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const [docs, total, unread] = await Promise.all([
      this.repository.listByUser(userId, page, limit),
      this.repository.countByUser(userId),
      this.repository.countUnread(userId),
    ]);
    return {
      data: docs.map((d) => NotificationResponseDto.fromDocument(d)),
      unread,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async unreadCount(userId: string): Promise<{ unread: number }> {
    return { unread: await this.repository.countUnread(userId) };
  }

  async markRead(id: string, userId: string): Promise<{ unread: number }> {
    await this.repository.markRead(id, userId);
    return { unread: await this.repository.countUnread(userId) };
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    return { updated: await this.repository.markAllRead(userId) };
  }
}

import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { IdParam } from '../../common/params';
import { NotificationService } from './notification.service';

// Endpoints cho chính chủ — mounted at /me/notifications (mọi vai trò đã đăng nhập).
export class NotificationController {
  constructor(private readonly service: NotificationService) {}

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 20));
    res.json(await this.service.list(req.user!.sub, page, limit));
  };

  unreadCount = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.unreadCount(req.user!.sub));
  };

  markRead = async (
    req: AuthRequest<IdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(await this.service.markRead(req.params.id, req.user!.sub));
  };

  markAllRead = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.markAllRead(req.user!.sub));
  };
}

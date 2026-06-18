import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { QueryAvailableSlotsDto } from '../../features/order/dto/query-available-slots.dto';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { OrderService } from './order.service';

// Customer endpoints — was features/order/order.controller.ts OrderController
// (@Controller('me/orders'), @UseGuards(JwtAuthGuard)).
export class OrderController {
  constructor(private readonly service: OrderService) {}

  // @Post() + IdempotencyInterceptor (applied at router level) → 201.
  create = async (req: AuthRequest, res: Response): Promise<void> => {
    res
      .status(201)
      .json(await this.service.createOrder(req.user!.sub, req.body));
  };

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.listOwn(req.user!.sub));
  };

  // @Post('preview') + @HttpCode(OK) → 200, no side effects.
  preview = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.previewOrder(req.user!.sub, req.body));
  };

  availableSlots = async (req: AuthRequest, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryAvailableSlotsDto;
    res.json(await this.service.listAvailableSlots(req.user!.sub, query));
  };

  getOne = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getOwn(req.user!.sub, req.params.id));
  };

  reschedule = async (
    req: AuthRequest<IdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(
      await this.service.rescheduleOwn(req.user!.sub, req.params.id, req.body),
    );
  };

  cancel = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(
      await this.service.cancelOwn(req.user!.sub, req.params.id, req.body),
    );
  };
}

// Public webhook endpoint — no auth, PayOS calls this. @HttpCode(OK) → 200.
export class PaymentWebhookController {
  constructor(private readonly service: OrderService) {}

  webhook = async (req: Request, res: Response): Promise<void> => {
    await this.service.handleWebhook(req.body);
    res.json({ success: true });
  };
}

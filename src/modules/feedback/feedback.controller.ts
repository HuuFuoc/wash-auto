import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { CreateFeedbackDto } from '../../shared/feedback/dto/create-feedback.dto';
import { FeedbackService } from './feedback.service';

interface OrderIdParam {
  orderId: string;
}

// Customer endpoints — mounted at /me/feedback (CUSTOMER).
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  submit = async (req: AuthRequest, res: Response): Promise<void> => {
    res
      .status(201)
      .json(
        await this.service.submit(req.user!.sub, req.body as CreateFeedbackDto),
      );
  };

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.listForCustomer(req.user!.sub));
  };

  getForOrder = async (
    req: AuthRequest<OrderIdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(await this.service.getForOrder(req.user!.sub, req.params.orderId));
  };
}

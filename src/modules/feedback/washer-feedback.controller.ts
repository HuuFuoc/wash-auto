import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { QueryFeedbackDto } from '../../shared/feedback/dto/query-feedback.dto';
import { FeedbackService } from './feedback.service';

// Washer self-view endpoints — mounted at /me/washer-feedback (WASHER).
// Always scoped to the caller's own washer id.
export class WasherFeedbackController {
  constructor(private readonly service: FeedbackService) {}

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryFeedbackDto;
    res.json(await this.service.listForWasher(req.user!.sub, query));
  };

  summary = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.washerSummary(req.user!.sub));
  };
}

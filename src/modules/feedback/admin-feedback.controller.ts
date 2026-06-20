import { Request, Response } from 'express';
import { QueryFeedbackDto } from '../../shared/feedback/dto/query-feedback.dto';
import { FeedbackService } from './feedback.service';

interface WasherIdParam {
  washerId: string;
}

// Manager/Admin endpoints — mounted at /admin/feedback (MANAGER/ADMIN).
export class AdminFeedbackController {
  constructor(private readonly service: FeedbackService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryFeedbackDto;
    res.json(await this.service.adminList(query));
  };

  washerSummary = async (
    req: Request<WasherIdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(await this.service.washerSummary(req.params.washerId));
  };
}

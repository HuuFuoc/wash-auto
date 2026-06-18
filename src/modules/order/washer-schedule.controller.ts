import { Response } from 'express';
import { GetWasherScheduleQueryDto } from '../../features/order/dto/get-washer-schedule-query.dto';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { OrderService } from './order.service';

// Washer endpoint — was features/order/washer-schedule.controller.ts
// (@Controller('washers/me'), guards at router level, WASHER). The washer id
// comes from the token so a washer only ever sees their own schedule.
export class WasherScheduleController {
  constructor(private readonly service: OrderService) {}

  getSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as GetWasherScheduleQueryDto;
    res.json(await this.service.getWasherSchedule(req.user!.sub, query));
  };
}

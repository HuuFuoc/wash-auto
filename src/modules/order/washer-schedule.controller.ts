import { Response } from 'express';
import { GetWasherScheduleQueryDto } from '../../shared/order/dto/get-washer-schedule-query.dto';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { OrderService } from './order.service';

// Washer endpoint — was features/order/washer-schedule.controller.ts
// (@Controller('washers/me'), guards at router level, WASHER). Shifts are
// anonymous now, so every washer sees the same shared day queue; actual
// assignments arrive via work orders.
export class WasherScheduleController {
  constructor(private readonly service: OrderService) {}

  getSchedule = async (req: AuthRequest, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as GetWasherScheduleQueryDto;
    res.json(await this.service.getWasherSchedule(query));
  };
}

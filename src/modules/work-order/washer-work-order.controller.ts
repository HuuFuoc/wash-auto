import { Response } from 'express';
import { IdParam } from '../../common/params';
import { FinishWorkOrderDto } from '../../features/work-order/dto/finish-work-order.dto';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { WorkOrderService } from './work-order.service';

// Washer endpoints — was features/work-order/washer-work-order.controller.ts
// (@Controller('me/work-orders'), guards at router level, WASHER).
export class WasherWorkOrderController {
  constructor(private readonly service: WorkOrderService) {}

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.listForWasher(req.user!.sub));
  };

  getOne = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getForWasher(req.user!.sub, req.params.id));
  };

  start = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.start(req.user!.sub, req.params.id));
  };

  finish = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    const dto = req.body as FinishWorkOrderDto;
    res.json(
      await this.service.finish(req.user!.sub, req.params.id, dto.checkoutPhotos),
    );
  };
}

import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { QueryOrderDto } from '../../shared/order/dto/query-order.dto';
import { OrderService } from './order.service';

// Admin endpoints — was features/order/admin-order.controller.ts
// (@Controller('admin/orders'), guards at router level, CASHIER/MANAGER/ADMIN).
export class AdminOrderController {
  constructor(private readonly service: OrderService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryOrderDto;
    res.json(await this.service.adminList(query));
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.adminGetOne(req.params.id));
  };

  updateStatus = async (
    req: Request<IdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(await this.service.adminUpdateStatus(req.params.id, req.body));
  };

  // @Post(':id/mark-paid') + @HttpCode(OK) → 200.
  markCashPaid = async (
    req: Request<IdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(await this.service.adminMarkCashPaid(req.params.id));
  };
}

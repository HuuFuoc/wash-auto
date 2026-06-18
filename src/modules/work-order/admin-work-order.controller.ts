import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { AssignWasherDto } from '../../shared/work-order/dto/assign-washer.dto';
import { CreateWorkOrderDto } from '../../shared/work-order/dto/create-work-order.dto';
import { QcWorkOrderDto } from '../../shared/work-order/dto/qc-work-order.dto';
import { QueryWorkOrderDto } from '../../shared/work-order/dto/query-work-order.dto';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { WorkOrderService } from './work-order.service';

// Admin endpoints — was features/work-order/admin-work-order.controller.ts
// (@Controller('admin/work-orders'), guards at router level, CASHIER/MANAGER/ADMIN).
export class AdminWorkOrderController {
  constructor(private readonly service: WorkOrderService) {}

  // Check-in → 201.
  create = async (req: AuthRequest, res: Response): Promise<void> => {
    const dto = req.body as CreateWorkOrderDto;
    res
      .status(201)
      .json(
        await this.service.createFromOrder(
          dto.orderId,
          req.user!.sub,
          dto.checkinPhotos,
        ),
      );
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryWorkOrderDto;
    res.json(await this.service.adminList(query));
  };

  // Declared before :id so "queue" is not read as an id.
  queue = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listQueue());
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.adminGetOne(req.params.id));
  };

  assign = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    const dto = req.body as AssignWasherDto;
    res.json(
      await this.service.assignWasher(
        req.params.id,
        dto.washerId,
        req.user!.sub,
      ),
    );
  };

  qc = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(
      await this.service.qualityCheck(
        req.params.id,
        req.body as QcWorkOrderDto,
        req.user!.sub,
      ),
    );
  };
}

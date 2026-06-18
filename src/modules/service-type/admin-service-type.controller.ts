import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { SetServiceTypeStatusDto } from '../../features/service-type/dto/set-service-type-status.dto';
import { ServiceTypeService } from './service-type.service';

// Admin endpoints — was features/service-type/admin-service-type.controller.ts
// (@Controller('admin/service-types'), guards applied at router level).
export class AdminServiceTypeController {
  constructor(private readonly service: ServiceTypeService) {}

  listAll = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listAll());
  };

  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.service.create(req.body));
  };

  update = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.update(req.params.id, req.body));
  };

  setActive = async (req: Request<IdParam>, res: Response): Promise<void> => {
    const dto = req.body as SetServiceTypeStatusDto;
    res.json(await this.service.setActive(req.params.id, dto.isActive));
  };
}

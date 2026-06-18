import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { ServiceTypeService } from './service-type.service';

// Public endpoints — was features/service-type/service-type.controller.ts
// (@Controller('service-types')).
export class ServiceTypeController {
  constructor(private readonly service: ServiceTypeService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listActive());
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getById(req.params.id));
  };
}

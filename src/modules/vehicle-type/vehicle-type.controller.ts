import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { VehicleTypeService } from './vehicle-type.service';

// Public endpoints — was features/vehicle-type/vehicle-type.controller.ts
// (@Controller('vehicle-types')).
export class VehicleTypeController {
  constructor(private readonly service: VehicleTypeService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listActive());
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getById(req.params.id));
  };
}

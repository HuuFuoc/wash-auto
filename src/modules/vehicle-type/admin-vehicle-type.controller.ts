import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { SetVehicleTypeStatusDto } from '../../features/vehicle-type/dto/set-vehicle-type-status.dto';
import { VehicleTypeService } from './vehicle-type.service';

// Admin endpoints — was features/vehicle-type/admin-vehicle-type.controller.ts
// (@Controller('admin/vehicle-types'), guards applied at router level).
export class AdminVehicleTypeController {
  constructor(private readonly service: VehicleTypeService) {}

  listAll = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listAll());
  };

  // @Post default status is 201.
  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.service.create(req.body));
  };

  update = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.update(req.params.id, req.body));
  };

  setActive = async (req: Request<IdParam>, res: Response): Promise<void> => {
    const dto = req.body as SetVehicleTypeStatusDto;
    res.json(await this.service.setActive(req.params.id, dto.isActive));
  };
}

import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { QueryVehicleDto } from '../../shared/vehicle/dto/query-vehicle.dto';
import { VehicleService } from './vehicle.service';

// Admin endpoints — was features/vehicle/admin-vehicle.controller.ts
// (@Controller('admin/vehicles'), guards applied at router level).
export class AdminVehicleController {
  constructor(private readonly service: VehicleService) {}

  // The transformed query DTO lives on req.validated.query (Express 5 makes
  // req.query read-only — see validateDto).
  list = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryVehicleDto;
    res.json(await this.service.adminList(query));
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.adminGetOne(req.params.id));
  };
}

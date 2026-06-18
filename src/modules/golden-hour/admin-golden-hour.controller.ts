import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { GoldenHourService } from './golden-hour.service';

// Admin endpoints — was features/golden-hour/admin-golden-hour.controller.ts
// (@Controller('admin/golden-hours'), guards applied at router level).
export class AdminGoldenHourController {
  constructor(private readonly service: GoldenHourService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.list());
  };

  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.service.create(req.body));
  };

  update = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.update(req.params.id, req.body));
  };

  // @Delete + @HttpCode(NO_CONTENT) → 204 with no body.
  remove = async (req: Request<IdParam>, res: Response): Promise<void> => {
    await this.service.remove(req.params.id);
    res.status(204).send();
  };
}

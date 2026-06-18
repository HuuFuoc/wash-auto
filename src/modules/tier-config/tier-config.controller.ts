import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { TierConfigService } from './tier-config.service';

// Public endpoints — was features/tier-config/tier-config.controller.ts
// (@Controller('tier-configs')).
export class TierConfigController {
  constructor(private readonly service: TierConfigService) {}

  list = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listActive());
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getById(req.params.id));
  };
}

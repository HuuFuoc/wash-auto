import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { SetTierConfigStatusDto } from '../../shared/tier-config/dto/set-tier-config-status.dto';
import { TierConfigService } from './tier-config.service';

// Admin endpoints — was features/tier-config/admin-tier-config.controller.ts
// (@Controller('admin/tier-configs'), guard ADMIN applied at router level).
export class AdminTierConfigController {
  constructor(private readonly service: TierConfigService) {}

  listAll = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listAll());
  };

  update = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.update(req.params.id, req.body));
  };

  setStatus = async (req: Request<IdParam>, res: Response): Promise<void> => {
    const dto = req.body as SetTierConfigStatusDto;
    res.json(await this.service.setStatus(req.params.id, dto));
  };
}

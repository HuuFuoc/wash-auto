import { Response } from 'express';
import { IdParam } from '../../common/params';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { CreateVoucherCampaignDto } from '../../shared/voucher-campaign/dto/create-voucher-campaign.dto';
import { QueryVoucherCampaignDto } from '../../shared/voucher-campaign/dto/query-voucher-campaign.dto';
import { UpdateVoucherCampaignDto } from '../../shared/voucher-campaign/dto/update-voucher-campaign.dto';
import { VoucherCampaignService } from './voucher-campaign.service';

/** Admin/manager endpoints — mounted at /admin/voucher-campaigns. */
export class AdminVoucherCampaignController {
  constructor(private readonly service: VoucherCampaignService) {}

  create = async (req: AuthRequest, res: Response): Promise<void> => {
    const dto = req.body as CreateVoucherCampaignDto;
    // Author comes from the verified token, never from the payload.
    res.status(201).json(await this.service.create(dto, req.user?.sub));
  };

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    const q = (req.validated?.query ?? {}) as QueryVoucherCampaignDto;
    res.json(
      await this.service.list(
        { status: q.status, source: q.source },
        q.page ?? 1,
        q.limit ?? 20,
      ),
    );
  };

  getOne = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getById(req.params.id));
  };

  update = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    const dto = req.body as UpdateVoucherCampaignDto;
    res.json(await this.service.update(req.params.id, dto));
  };

  activate = async (
    req: AuthRequest<IdParam>,
    res: Response,
  ): Promise<void> => {
    res.json(await this.service.activate(req.params.id));
  };

  pause = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.pause(req.params.id));
  };

  end = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.end(req.params.id));
  };

  stats = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.stats(req.params.id));
  };
}

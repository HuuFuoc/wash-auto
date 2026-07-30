import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { QueryPublicVoucherCampaignDto } from '../../shared/voucher-campaign/dto/query-public-voucher-campaign.dto';
import { VoucherCampaignService } from './voucher-campaign.service';

/**
 * Public read endpoints — mounted at /voucher-campaigns, no auth.
 *
 * Mirrors the other public config routes (`/tier-configs`, `/service-types`).
 * Returns the customer-safe projection only: commercial internals (budget,
 * spend counters, total issue limit, claim code) never leave the admin API.
 */
export class VoucherCampaignController {
  constructor(private readonly service: VoucherCampaignService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const q = (req.validated?.query ?? {}) as QueryPublicVoucherCampaignDto;
    res.json(
      await this.service.listPublic(q.status, q.page ?? 1, q.limit ?? 20),
    );
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getPublicById(req.params.id));
  };
}

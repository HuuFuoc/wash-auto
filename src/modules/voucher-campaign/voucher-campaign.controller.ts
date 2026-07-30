import { Response } from 'express';
import { IdParam } from '../../common/params';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { QueryPublicVoucherCampaignDto } from '../../shared/voucher-campaign/dto/query-public-voucher-campaign.dto';
import { VoucherService } from '../voucher/voucher.service';
import { VoucherCampaignService } from './voucher-campaign.service';

/**
 * Public campaign endpoints — mounted at /voucher-campaigns.
 *
 * The two reads mirror the other public config routes (`/tier-configs`,
 * `/service-types`) and return the customer-safe projection only: commercial
 * internals (budget, spend counters, total issue limit, claim code) never leave
 * the admin API. Auth on them is OPTIONAL — a bearer token only adds the
 * viewer's own `alreadyClaimed` flag; without one the pages still render.
 *
 * The claim, by contrast, requires a token: it hands a voucher to a specific
 * wallet.
 */
export class VoucherCampaignController {
  constructor(
    private readonly service: VoucherCampaignService,
    private readonly voucherService: VoucherService,
  ) {}

  list = async (req: AuthRequest, res: Response): Promise<void> => {
    const q = (req.validated?.query ?? {}) as QueryPublicVoucherCampaignDto;
    res.json(
      await this.service.listPublic(
        q.status,
        q.page ?? 1,
        q.limit ?? 20,
        req.user?.sub,
      ),
    );
  };

  getOne = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getPublicById(req.params.id, req.user?.sub));
  };

  // 201 to match POST /me/vouchers/claim — both mint the customer a voucher,
  // and the response body is the same VoucherResponse either way.
  claim = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res
      .status(201)
      .json(
        await this.voucherService.claimFromCampaignId(
          req.user!.sub,
          req.params.id,
        ),
      );
  };
}

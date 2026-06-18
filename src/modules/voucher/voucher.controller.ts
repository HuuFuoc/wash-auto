import { Response } from 'express';
import { IdParam } from '../../common/params';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { VoucherStatusEnum } from '../../shared/voucher/types/voucher-status.enum';
import { VoucherService } from './voucher.service';

// Customer endpoints — was features/voucher/voucher.controller.ts
// (@Controller('me/vouchers'), @UseGuards(JwtAuthGuard)).
export class VoucherController {
  constructor(private readonly service: VoucherService) {}

  // ?status=unused filters; raw query param (no DTO in the original).
  list = async (req: AuthRequest, res: Response): Promise<void> => {
    const status = req.query.status as VoucherStatusEnum | undefined;
    res.json(await this.service.listForCustomer(req.user!.sub, status));
  };

  getOne = async (req: AuthRequest<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getForCustomer(req.user!.sub, req.params.id));
  };
}

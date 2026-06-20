import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { BulkCreateVoucherDto } from '../../shared/voucher/dto/bulk-create-voucher.dto';
import { QueryVoucherDto } from '../../shared/voucher/dto/query-voucher.dto';
import { RevokeVoucherDto } from '../../shared/voucher/dto/revoke-voucher.dto';
import { VoucherService } from './voucher.service';

// Admin endpoints — was features/voucher/admin-voucher.controller.ts
// (@Controller('admin/vouchers'), guards at router level).
export class AdminVoucherController {
  constructor(private readonly service: VoucherService) {}

  grant = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.service.adminGrantForCustomer(req.body));
  };

  bulkCreate = async (req: Request, res: Response): Promise<void> => {
    res
      .status(201)
      .json(
        await this.service.adminBulkCreate(req.body as BulkCreateVoucherDto),
      );
  };

  list = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryVoucherDto;
    res.json(await this.service.adminList(query));
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.adminGetById(req.params.id));
  };

  // @Patch + @HttpCode(OK) → 200.
  revoke = async (req: Request<IdParam>, res: Response): Promise<void> => {
    const dto = req.body as RevokeVoucherDto;
    res.json(await this.service.adminRevoke(req.params.id, dto.reason));
  };
}

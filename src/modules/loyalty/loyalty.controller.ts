import { Response } from 'express';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { LoyaltyService } from './loyalty.service';

// Customer endpoints — was features/loyalty/loyalty.controller.ts
// (@Controller('me/loyalty'), @UseGuards(JwtAuthGuard)).
export class LoyaltyController {
  constructor(private readonly service: LoyaltyService) {}

  getMine = async (req: AuthRequest, res: Response): Promise<void> => {
    res.json(await this.service.getForCustomer(req.user!.sub));
  };

  // page/limit were @Query + DefaultValuePipe + ParseIntPipe; clamp identically.
  listTransactions = async (
    req: AuthRequest,
    res: Response,
  ): Promise<void> => {
    const rawPage = parseInt(String(req.query.page ?? '1'), 10);
    const rawLimit = parseInt(String(req.query.limit ?? '20'), 10);
    const safePage = Math.max(1, Number.isNaN(rawPage) ? 1 : rawPage);
    const safeLimit = Math.min(
      100,
      Math.max(1, Number.isNaN(rawLimit) ? 20 : rawLimit),
    );
    res.json(
      await this.service.listTransactions(req.user!.sub, safePage, safeLimit),
    );
  };
}

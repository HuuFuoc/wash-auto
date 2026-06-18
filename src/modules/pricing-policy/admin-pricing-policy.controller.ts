import { Request, Response } from 'express';
import { PricingPolicyService } from './pricing-policy.service';

// Admin endpoints — was features/pricing-policy/admin-pricing-policy.controller.ts
// (@Controller('admin/pricing-policy'), guard ADMIN applied at router level).
export class AdminPricingPolicyController {
  constructor(private readonly service: PricingPolicyService) {}

  get = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.get());
  };

  update = async (req: Request, res: Response): Promise<void> => {
    res.json(await this.service.update(req.body));
  };
}

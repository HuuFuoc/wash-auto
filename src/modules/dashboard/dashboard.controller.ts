import { Response } from 'express';
import { QueryDashboardDto } from '../../shared/dashboard/dto/query-dashboard.dto';
import { AuthRequest } from '../../middlewares/auth.middleware';
import { DashboardService } from './dashboard.service';

// Admin endpoints — was features/dashboard/dashboard.controller.ts
// (@Controller('admin/dashboard'), guards at router level, MANAGER/ADMIN).
// Scope (full vs manager) is derived from req.user.role, never the request.
export class DashboardController {
  constructor(private readonly service: DashboardService) {}

  getReport = async (req: AuthRequest, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryDashboardDto;
    res.json(await this.service.getReport(query, req.user!.role));
  };
}

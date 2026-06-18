import { Request, Response } from 'express';
import { IdParam } from '../../common/params';
import { QueryStaffShiftDto } from '../../shared/staff-shift/dto/query-staff-shift.dto';
import { StaffShiftService } from './staff-shift.service';

// Admin endpoints — was features/staff-shift/admin-staff-shift.controller.ts
// (@Controller('admin/shifts'), guards at router level, MANAGER/ADMIN).
export class AdminStaffShiftController {
  constructor(private readonly service: StaffShiftService) {}

  list = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryStaffShiftDto;
    res.json(await this.service.adminList(query));
  };

  assignableStaff = async (_req: Request, res: Response): Promise<void> => {
    res.json(await this.service.listAssignableStaff());
  };

  getOne = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.getById(req.params.id));
  };

  create = async (req: Request, res: Response): Promise<void> => {
    res.status(201).json(await this.service.create(req.body));
  };

  update = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.update(req.params.id, req.body));
  };

  setStatus = async (req: Request<IdParam>, res: Response): Promise<void> => {
    res.json(await this.service.setStatus(req.params.id, req.body));
  };
}

import { Request, Response } from 'express';
import { QueryAvailableShiftDto } from '../../shared/staff-shift/dto/query-available-shift.dto';
import { StaffShiftService } from './staff-shift.service';

// Authenticated endpoints — was features/staff-shift/staff-shift.controller.ts
// (@Controller('shifts'), @UseGuards(JwtAuthGuard)).
export class StaffShiftController {
  constructor(private readonly service: StaffShiftService) {}

  listAvailable = async (req: Request, res: Response): Promise<void> => {
    const query = (req.validated?.query ?? {}) as QueryAvailableShiftDto;
    res.json(await this.service.listAvailable(query));
  };
}

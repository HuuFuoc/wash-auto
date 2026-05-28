import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { QueryAvailableShiftDto } from './dto/query-available-shift.dto';
import { StaffShiftResponseDto } from './dto/staff-shift-response.dto';
import { StaffShiftService } from './staff-shift.service';

@ApiTags('shifts')
@ApiBearerAuth()
@Controller('shifts')
@UseGuards(JwtAuthGuard)
export class StaffShiftController {
  constructor(private readonly service: StaffShiftService) {}

  @Get('available')
  @ApiOperation({
    summary: 'List scheduled shifts in a time window',
    description:
      'Returns scheduled shifts whose start_at falls in [from, to], sorted by start_at ascending. Time-overlap (1 wash at a time per shift) is enforced at booking time — this endpoint does not pre-filter shifts by remaining capacity. Use during the booking flow to show the customer which shifts exist. Filter by shiftType=washer or =cashier if needed.',
  })
  @ApiResponse({
    status: 200,
    type: StaffShiftResponseDto,
    isArray: true,
  })
  @ApiResponse({ status: 400, description: 'from must be ≤ to' })
  listAvailable(
    @Query() query: QueryAvailableShiftDto,
  ): Promise<StaffShiftResponseDto[]> {
    return this.service.listAvailable(query);
  }
}

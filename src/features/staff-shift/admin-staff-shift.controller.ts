import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { RoleEnum } from '../auth/types/role.enum';
import { CreateStaffShiftDto } from './dto/create-staff-shift.dto';
import { QueryStaffShiftDto } from './dto/query-staff-shift.dto';
import { SetStaffShiftStatusDto } from './dto/set-staff-shift-status.dto';
import { StaffShiftListResponseDto } from './dto/staff-shift-list-response.dto';
import { StaffShiftResponseDto } from './dto/staff-shift-response.dto';
import { UpdateStaffShiftDto } from './dto/update-staff-shift.dto';
import { AssignableStaff, StaffShiftService } from './staff-shift.service';

@ApiTags('admin · shifts')
@ApiBearerAuth()
@Controller('admin/shifts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.MANAGER, RoleEnum.ADMIN)
export class AdminStaffShiftController {
  constructor(private readonly service: StaffShiftService) {}

  @Get()
  @ApiOperation({
    summary: 'List shifts with filters (manager/admin)',
    description:
      'Paginated. Filter by staffId, shiftType, status, and a start_at date range.',
  })
  @ApiResponse({ status: 200, type: StaffShiftListResponseDto })
  list(@Query() query: QueryStaffShiftDto): Promise<StaffShiftListResponseDto> {
    return this.service.adminList(query);
  }

  @Get('staff')
  @ApiOperation({
    summary: 'List assignable staff for shifts (manager/admin)',
    description:
      'Active washers + cashiers that can be assigned to a shift. Lets ' +
      'managers (who cannot list all users) pick a real staff member.',
  })
  assignableStaff(): Promise<AssignableStaff[]> {
    return this.service.listAssignableStaff();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one shift (manager/admin)' })
  @ApiResponse({ status: 200, type: StaffShiftResponseDto })
  @ApiResponse({ status: 404, description: 'Shift not found' })
  getOne(@Param('id') id: string): Promise<StaffShiftResponseDto> {
    return this.service.getById(id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create shift(s) (manager/admin)',
    description:
      'staffId must belong to a user whose role matches shiftType (cashier ↔ cashier, washer ↔ washer). Provide date + block (morning/afternoon/fullday); the server derives start/end. fullday creates two shifts (morning + afternoon) and returns both. status auto=scheduled. If any block overlaps an existing shift for the same staff, the whole request is rejected (all-or-nothing). Always returns an array.',
  })
  @ApiResponse({ status: 201, type: StaffShiftResponseDto, isArray: true })
  @ApiResponse({
    status: 400,
    description:
      'Time invalid, staff missing/inactive, role mismatch, or overlap',
  })
  create(@Body() dto: CreateStaffShiftDto): Promise<StaffShiftResponseDto[]> {
    return this.service.create(dto);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update shift (manager/admin)',
    description:
      'Partial update. Provide date + block together to move the shift. Use PATCH /:id/status for state transitions.',
  })
  @ApiResponse({ status: 200, type: StaffShiftResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  @ApiResponse({ status: 404, description: 'Shift not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateStaffShiftDto,
  ): Promise<StaffShiftResponseDto> {
    return this.service.update(id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Change shift status (manager/admin)',
    description:
      'State machine: scheduled→active, active→completed, scheduled|active→cancelled. completed/cancelled are terminal.',
  })
  @ApiResponse({ status: 200, type: StaffShiftResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Shift not found' })
  setStatus(
    @Param('id') id: string,
    @Body() dto: SetStaffShiftStatusDto,
  ): Promise<StaffShiftResponseDto> {
    return this.service.setStatus(id, dto);
  }
}

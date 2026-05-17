import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
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
import { BookingListResponseDto } from './dto/booking-list-response.dto';
import { BookingResponseDto } from './dto/booking-response.dto';
import { QueryBookingDto } from './dto/query-booking.dto';
import { UpdateBookingStatusDto } from './dto/update-booking-status.dto';
import { BookingService } from './booking.service';

@ApiTags('admin · bookings')
@ApiBearerAuth()
@Controller('admin/bookings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.CASHIER, RoleEnum.MANAGER, RoleEnum.ADMIN)
export class AdminBookingController {
  constructor(private readonly service: BookingService) {}

  @Get()
  @ApiOperation({
    summary: 'List bookings (cashier/manager/admin)',
    description:
      'Paginated. Filter by status, customerId, scheduled date range, and search by partial customer phone or partial vehicle license plate (per docs §5.3 — cashier search at the counter). Sorted by scheduledAt ascending so the queue surfaces upcoming work first.',
  })
  @ApiResponse({ status: 200, type: BookingListResponseDto })
  list(@Query() query: QueryBookingDto): Promise<BookingListResponseDto> {
    return this.service.adminList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one booking by id (cashier/manager/admin)' })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  getOne(@Param('id') id: string): Promise<BookingResponseDto> {
    return this.service.adminGetOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Change booking status (cashier/manager/admin)',
    description:
      'State machine: pending→confirmed/cancelled/no_show; confirmed→in_progress/cancelled/no_show; in_progress→done. Transitioning out of an active state automatically releases the shift slot.',
  })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateBookingStatusDto,
  ): Promise<BookingResponseDto> {
    return this.service.adminUpdateStatus(id, dto);
  }
}

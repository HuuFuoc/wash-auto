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
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { RoleEnum } from '../auth/types/role.enum';
import { AssignWasherDto } from './dto/assign-washer.dto';
import { CancelWashSessionDto } from './dto/cancel-wash-session.dto';
import { CreateFromBookingDto } from './dto/create-from-booking.dto';
import { CreateWalkInDto } from './dto/create-walk-in.dto';
import { QueryWashSessionDto } from './dto/query-wash-session.dto';
import { WashSessionListResponseDto } from './dto/wash-session-list-response.dto';
import { WashSessionResponseDto } from './dto/wash-session-response.dto';
import { WashSessionService } from './wash-session.service';

@ApiTags('admin · wash-sessions')
@ApiBearerAuth()
@Controller('admin/wash-sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.CASHIER, RoleEnum.MANAGER, RoleEnum.ADMIN)
export class AdminWashSessionController {
  constructor(private readonly service: WashSessionService) {}

  @Post('from-booking')
  @ApiOperation({
    summary: 'Open wash session from an existing booking (cashier)',
    description:
      'Customer arrived at the counter; cashier opens the actual wash record. Snapshots the service base price. Booking must be in pending or confirmed status. One booking can only open one wash session — second attempt returns 409.',
  })
  @ApiResponse({ status: 201, type: WashSessionResponseDto })
  @ApiResponse({ status: 400, description: 'Booking not in valid status' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'Wash session already exists' })
  createFromBooking(
    @CurrentUser() user: IAuthPayload,
    @Body() dto: CreateFromBookingDto,
  ): Promise<WashSessionResponseDto> {
    return this.service.createFromBooking(user.sub, dto);
  }

  @Post('walk-in')
  @ApiOperation({
    summary: 'Open walk-in wash session (cashier)',
    description:
      'Walk-in customer without a booking. Cashier supplies customerId + vehicleId + serviceTypeId; vehicle ownership is verified. booking_id stays null on the session.',
  })
  @ApiResponse({ status: 201, type: WashSessionResponseDto })
  @ApiResponse({
    status: 400,
    description:
      'Vehicle/service not found, or vehicle does not belong to customer',
  })
  createWalkIn(
    @CurrentUser() user: IAuthPayload,
    @Body() dto: CreateWalkInDto,
  ): Promise<WashSessionResponseDto> {
    return this.service.createWalkIn(user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List wash sessions (paginated, filterable)',
    description:
      'Filters: status, cashierId, washerId, customerId, createdFrom, createdTo.',
  })
  @ApiResponse({ status: 200, type: WashSessionListResponseDto })
  list(
    @Query() query: QueryWashSessionDto,
  ): Promise<WashSessionListResponseDto> {
    return this.service.adminList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one wash session' })
  @ApiResponse({ status: 200, type: WashSessionResponseDto })
  @ApiResponse({ status: 404, description: 'Wash session not found' })
  getOne(@Param('id') id: string): Promise<WashSessionResponseDto> {
    return this.service.adminGetOne(id);
  }

  @Patch(':id/assign-washer')
  @ApiOperation({
    summary: 'Assign a washer to a wash session (cashier)',
    description:
      'Session must be in WAITING. washerId must belong to a user with role=washer and is_active=true. Session transitions to ASSIGNED.',
  })
  @ApiResponse({ status: 200, type: WashSessionResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Bad state, or washerId is not a washer',
  })
  @ApiResponse({ status: 404, description: 'Wash session not found' })
  assignWasher(
    @Param('id') id: string,
    @Body() dto: AssignWasherDto,
  ): Promise<WashSessionResponseDto> {
    return this.service.assignWasher(id, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel wash session (cashier)',
    description:
      'Allowed from WAITING/ASSIGNED/IN_PROGRESS. The linked booking is NOT auto-cancelled — cashier handles it separately via /admin/bookings/:id/status.',
  })
  @ApiResponse({ status: 200, type: WashSessionResponseDto })
  @ApiResponse({ status: 400, description: 'Already terminal' })
  @ApiResponse({ status: 404, description: 'Wash session not found' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelWashSessionDto,
  ): Promise<WashSessionResponseDto> {
    return this.service.cancel(id, dto);
  }
}

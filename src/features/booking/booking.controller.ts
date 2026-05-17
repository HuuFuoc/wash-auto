import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { RescheduleBookingDto } from './dto/reschedule-booking.dto';
import { BookingService } from './booking.service';

@ApiTags('me · bookings')
@ApiBearerAuth()
@Controller('me/bookings')
@UseGuards(JwtAuthGuard)
export class BookingController {
  constructor(private readonly service: BookingService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a booking',
    description:
      'Validates: vehicle is yours and active, service is active, shift is scheduled and the time falls inside the shift window, scheduledAt is in the future and within your tier booking_window_days, and you have fewer than the active booking cap. Reserves shift capacity atomically — returns 409 if the shift fills up between the check and your call.',
  })
  @ApiResponse({ status: 201, type: BookingResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation / business rule failed',
  })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  @ApiResponse({ status: 409, description: 'Shift is full' })
  create(
    @CurrentUser() user: IAuthPayload,
    @Body() dto: CreateBookingDto,
  ): Promise<BookingResponseDto> {
    return this.service.createBooking(user.sub, dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List my bookings',
    description: 'Returns all bookings sorted by scheduledAt descending.',
  })
  @ApiResponse({ status: 200, type: BookingResponseDto, isArray: true })
  list(@CurrentUser() user: IAuthPayload): Promise<BookingResponseDto[]> {
    return this.service.listOwn(user.sub);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get one of my bookings',
    description:
      'Ownership-protected — 404 if the booking belongs to another customer.',
  })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  getOne(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<BookingResponseDto> {
    return this.service.getOwn(user.sub, id);
  }

  @Patch(':id/reschedule')
  @ApiOperation({
    summary: 'Reschedule one of my bookings',
    description:
      'Limit per booking (env MAX_RESCHEDULES, default 2). Releases the old shift slot, reserves the new one atomically. The booking must be in pending or confirmed status.',
  })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({ status: 400, description: 'Limit hit or status not allowed' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  @ApiResponse({ status: 409, description: 'New shift is full' })
  reschedule(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: RescheduleBookingDto,
  ): Promise<BookingResponseDto> {
    return this.service.rescheduleOwn(user.sub, id, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({
    summary: 'Cancel one of my bookings',
    description:
      'Only allowed from pending or confirmed status. Releases the shift slot. Use a short reason if you want to log why.',
  })
  @ApiResponse({ status: 200, type: BookingResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Booking already in terminal state',
  })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  cancel(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: CancelBookingDto,
  ): Promise<BookingResponseDto> {
    return this.service.cancelOwn(user.sub, id, dto);
  }
}

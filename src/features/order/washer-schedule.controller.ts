import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
import { GetWasherScheduleQueryDto } from './dto/get-washer-schedule-query.dto';
import { WasherScheduleItemDto } from './dto/washer-schedule-item.dto';
import { OrderService } from './services/order.service';

@ApiTags('washer · schedule')
@ApiBearerAuth()
@Controller('washers/me')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.WASHER)
export class WasherScheduleController {
  constructor(private readonly service: OrderService) {}

  @Get('schedule')
  @ApiOperation({
    summary: 'My work schedule (washer)',
    description:
      'Bookings assigned to the authenticated washer (via their rostered ' +
      'shifts), sorted by appointment time ascending. Filter by a single ' +
      '`date`, a `from`/`to` range (which overrides `date`), and/or `status`. ' +
      'With no filter the schedule runs from the start of today onwards. The ' +
      'washer id is taken from the token, so a washer only ever sees their own ' +
      'schedule.',
  })
  @ApiResponse({ status: 200, type: WasherScheduleItemDto, isArray: true })
  @ApiResponse({ status: 400, description: '`from` is after `to`' })
  getSchedule(
    @CurrentUser() user: IAuthPayload,
    @Query() query: GetWasherScheduleQueryDto,
  ): Promise<WasherScheduleItemDto[]> {
    return this.service.getWasherSchedule(user.sub, query);
  }
}

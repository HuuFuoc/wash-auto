import {
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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { RoleEnum } from '../auth/types/role.enum';
import { WashSessionResponseDto } from './dto/wash-session-response.dto';
import { WashSessionStatusEnum } from './types/wash-session-status.enum';
import { WashSessionService } from './wash-session.service';

@ApiTags('me · washer · sessions')
@ApiBearerAuth()
@Controller('me/washer/sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.WASHER)
export class WasherWashSessionController {
  constructor(private readonly service: WashSessionService) {}

  @Get()
  @ApiOperation({
    summary: 'List wash sessions assigned to me (washer)',
    description:
      'Optional status filter — typical usage: `?status=assigned` to see your queue, or `?status=in_progress` to see ones you started.',
  })
  @ApiQuery({ name: 'status', enum: WashSessionStatusEnum, required: false })
  @ApiResponse({ status: 200, type: WashSessionResponseDto, isArray: true })
  list(
    @CurrentUser() user: IAuthPayload,
    @Query('status') status?: WashSessionStatusEnum,
  ): Promise<WashSessionResponseDto[]> {
    return this.service.washerListMine(user.sub, status);
  }

  @Patch(':id/start')
  @ApiOperation({
    summary: 'Start washing (washer)',
    description:
      'Session must be ASSIGNED to you. Transitions to IN_PROGRESS, records started_at=now, and auto-syncs the linked booking → in_progress (if present).',
  })
  @ApiResponse({ status: 200, type: WashSessionResponseDto })
  @ApiResponse({ status: 400, description: 'Session not in ASSIGNED state' })
  @ApiResponse({
    status: 403,
    description: 'Session assigned to another washer',
  })
  @ApiResponse({ status: 404, description: 'Wash session not found' })
  start(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<WashSessionResponseDto> {
    return this.service.washerStart(user.sub, id);
  }

  @Patch(':id/complete')
  @ApiOperation({
    summary: 'Finish washing (washer)',
    description:
      'Session must be IN_PROGRESS. Transitions to DONE, records completed_at=now, and auto-syncs the linked booking → done (if present).',
  })
  @ApiResponse({ status: 200, type: WashSessionResponseDto })
  @ApiResponse({ status: 400, description: 'Session not IN_PROGRESS' })
  @ApiResponse({
    status: 403,
    description: 'Session assigned to another washer',
  })
  @ApiResponse({ status: 404, description: 'Wash session not found' })
  complete(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<WashSessionResponseDto> {
    return this.service.washerComplete(user.sub, id);
  }
}

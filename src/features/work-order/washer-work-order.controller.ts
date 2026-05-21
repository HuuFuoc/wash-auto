import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
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
import { UpdateChecklistDto } from './dto/update-checklist.dto';
import { WorkOrderResponseDto } from './dto/work-order-response.dto';
import { WorkOrderService } from './work-order.service';

@ApiTags('me · work-orders')
@ApiBearerAuth()
@Controller('me/work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.WASHER)
export class WasherWorkOrderController {
  constructor(private readonly service: WorkOrderService) {}

  @Get()
  @ApiOperation({ summary: 'List work orders assigned to me (washer)' })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto, isArray: true })
  list(@CurrentUser() user: IAuthPayload): Promise<WorkOrderResponseDto[]> {
    return this.service.listForWasher(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my assigned work orders' })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  getOne(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<WorkOrderResponseDto> {
    return this.service.getForWasher(user.sub, id);
  }

  @Patch(':id/start')
  @ApiOperation({
    summary: 'Start the wash',
    description:
      'ASSIGNED or RETURNED → IN_PROGRESS. Also moves the order to in_progress.',
  })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Work order cannot be started' })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  start(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<WorkOrderResponseDto> {
    return this.service.start(user.sub, id);
  }

  @Patch(':id/checklist')
  @ApiOperation({
    summary: 'Tick a checklist item',
    description: 'Only while the work order is IN_PROGRESS.',
  })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Not in progress, or index out of range',
  })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  updateChecklist(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: UpdateChecklistDto,
  ): Promise<WorkOrderResponseDto> {
    return this.service.updateChecklistItem(user.sub, id, dto.index, dto.done);
  }

  @Patch(':id/finish')
  @ApiOperation({
    summary: 'Finish the wash',
    description: 'IN_PROGRESS → QUALITY_CHECK. Awaits cashier/manager QC.',
  })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Work order is not in progress' })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  finish(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<WorkOrderResponseDto> {
    return this.service.finish(user.sub, id);
  }
}

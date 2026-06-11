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
import { CreateWorkOrderDto } from './dto/create-work-order.dto';
import { QcWorkOrderDto } from './dto/qc-work-order.dto';
import { QueryWorkOrderDto } from './dto/query-work-order.dto';
import {
  WorkOrderListResponseDto,
  WorkOrderResponseDto,
} from './dto/work-order-response.dto';
import { WorkOrderService } from './work-order.service';

@ApiTags('admin · work-orders')
@ApiBearerAuth()
@Controller('admin/work-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.CASHIER, RoleEnum.MANAGER, RoleEnum.ADMIN)
export class AdminWorkOrderController {
  constructor(private readonly service: WorkOrderService) {}

  @Post()
  @ApiOperation({
    summary: 'Check-in: create a work order from a confirmed order',
    description:
      'Cashier action when the customer arrives. Creates the job ticket ' +
      '(status WAITING) and moves the order CONFIRMED → CHECKED_IN. The ' +
      'cashier may attach vehicle photos taken at check-in (checkinPhotos). ' +
      'For cash orders this also settles payment (marks the order PAID). One ' +
      'work order per order.',
  })
  @ApiResponse({ status: 201, type: WorkOrderResponseDto })
  @ApiResponse({ status: 400, description: 'Order is not in confirmed status' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({
    status: 409,
    description: 'A work order already exists for this order',
  })
  create(
    @CurrentUser() user: IAuthPayload,
    @Body() dto: CreateWorkOrderDto,
  ): Promise<WorkOrderResponseDto> {
    return this.service.createFromOrder(
      dto.orderId,
      user.sub,
      dto.checkinPhotos,
    );
  }

  @Get()
  @ApiOperation({
    summary: 'List work orders (cashier/manager/admin)',
    description: 'Paginated. Filter by status and assigned washer.',
  })
  @ApiResponse({ status: 200, type: WorkOrderListResponseDto })
  list(@Query() query: QueryWorkOrderDto): Promise<WorkOrderListResponseDto> {
    return this.service.adminList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one work order by id' })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  getOne(@Param('id') id: string): Promise<WorkOrderResponseDto> {
    return this.service.adminGetOne(id);
  }

  @Patch(':id/assign')
  @ApiOperation({
    summary: 'Assign (or re-assign) a washer',
    description:
      'Allowed while the work order is WAITING, ASSIGNED, or RETURNED (so a ' +
      'manager can hand a QC-rejected wash to a different washer). Re-assigning ' +
      'a RETURNED ticket moves it back to ASSIGNED. washerId must belong to a ' +
      'user with role=washer.',
  })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Invalid washer, or work order already started',
  })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  @ApiResponse({
    status: 409,
    description: 'Washer is already handling another active work order',
  })
  assign(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: AssignWasherDto,
  ): Promise<WorkOrderResponseDto> {
    return this.service.assignWasher(id, dto.washerId, user.sub);
  }

  @Patch(':id/qc')
  @ApiOperation({
    summary: 'Quality check a finished work order',
    description:
      'passed=true → work order DONE and order COMPLETED (shift slot ' +
      'released). passed=false → work order RETURNED to the washer.',
  })
  @ApiResponse({ status: 200, type: WorkOrderResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Work order is not awaiting quality check',
  })
  @ApiResponse({ status: 404, description: 'Work order not found' })
  qc(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: QcWorkOrderDto,
  ): Promise<WorkOrderResponseDto> {
    return this.service.qualityCheck(id, dto, user.sub);
  }
}

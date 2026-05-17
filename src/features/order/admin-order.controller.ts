import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
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
import {
  OrderListResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { OrderService } from './services/order.service';

@ApiTags('admin · orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.CASHIER, RoleEnum.MANAGER, RoleEnum.ADMIN)
export class AdminOrderController {
  constructor(private readonly service: OrderService) {}

  @Get()
  @ApiOperation({
    summary: 'List orders (cashier/manager/admin)',
    description:
      'Paginated. Filter by status, payment method/status, customerId, scheduled date range. Cashier search by partial phone or license plate.',
  })
  @ApiResponse({ status: 200, type: OrderListResponseDto })
  list(@Query() query: QueryOrderDto): Promise<OrderListResponseDto> {
    return this.service.adminList(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one order by id' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOne(@Param('id') id: string): Promise<OrderResponseDto> {
    return this.service.adminGetOne(id);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Change order status',
    description:
      'State machine: pending_payment→confirmed/cancelled, confirmed→checked_in/cancelled/no_show, checked_in→in_progress/cancelled/no_show, in_progress→completed.',
  })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid status transition' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<OrderResponseDto> {
    return this.service.adminUpdateStatus(id, dto);
  }

  @Post(':id/mark-paid')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cashier marks a CASH order as PAID after collecting money',
  })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Only cash orders can be marked paid manually',
  })
  @ApiResponse({ status: 404, description: 'Order not found' })
  markCashPaid(@Param('id') id: string): Promise<OrderResponseDto> {
    return this.service.adminMarkCashPaid(id);
  }
}

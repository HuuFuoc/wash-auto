import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
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
import { PaymentService } from './payment.service';

@ApiTags('admin · orders')
@ApiBearerAuth()
@Controller('admin/orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleEnum.ADMIN, RoleEnum.MANAGER, RoleEnum.CASHIER)
export class AdminPaymentController {
  constructor(private readonly service: PaymentService) {}

  @Get()
  @ApiOperation({
    summary: 'List all orders (admin/manager/cashier)',
    description: 'Paginated. Filter by customerId and status.',
  })
  @ApiResponse({ status: 200, type: OrderListResponseDto })
  list(@Query() query: QueryOrderDto): Promise<OrderListResponseDto> {
    return this.service.adminListOrders(query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get any order by id (admin/manager/cashier)',
    description: 'Returns 404 if id is invalid or unknown.',
  })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOne(@Param('id') id: string): Promise<OrderResponseDto> {
    return this.service.adminGetOrder(id);
  }
}

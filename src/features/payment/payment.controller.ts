import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderListResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { PaymentService } from './payment.service';

@ApiTags('me · orders')
@ApiBearerAuth()
@Controller('me/orders')
@UseGuards(JwtAuthGuard)
export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a wash order',
    description:
      'Creates a new order and returns a PayOS checkout URL for payment. Amount is derived from the selected service type base price.',
  })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Service type not found or inactive' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  create(
    @CurrentUser() user: IAuthPayload,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.service.createOrder(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my orders' })
  @ApiResponse({ status: 200, type: OrderListResponseDto })
  list(
    @CurrentUser() user: IAuthPayload,
    @Query() query: QueryOrderDto,
  ): Promise<OrderListResponseDto> {
    return this.service.listMyOrders(user.sub, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my orders' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOne(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return this.service.getMyOrder(user.sub, id);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a pending order',
    description: 'Only PENDING orders can be cancelled.',
  })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Order is not cancellable' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  cancel(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return this.service.cancelMyOrder(user.sub, id);
  }
}

/** Public webhook endpoint — no auth, PayOS calls this after payment */
@ApiTags('payments · webhook')
@Controller('payments')
export class PaymentWebhookController {
  constructor(private readonly service: PaymentService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'PayOS payment webhook',
    description:
      'Receives payment status notifications from PayOS. Signature is verified internally.',
  })
  async webhook(@Body() body: unknown): Promise<{ success: boolean }> {
    await this.service.handleWebhook(body);
    return { success: true };
  }
}

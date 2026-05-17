import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../shared/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { IdempotencyInterceptor } from '../../shared/interceptors/idempotency.interceptor';
import type { IAuthPayload } from '../../shared/types/auth-payload.type';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderResponseDto } from './dto/order-response.dto';
import { RescheduleOrderDto } from './dto/reschedule-order.dto';
import { OrderService } from './services/order.service';

@ApiTags('me · orders')
@ApiBearerAuth()
@Controller('me/orders')
@UseGuards(JwtAuthGuard)
export class OrderController {
  constructor(private readonly service: OrderService) {}

  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  @ApiOperation({
    summary: 'Create an order (booking + optional online payment)',
    description:
      'Authorization is the regular access token from /auth/login. paymentMethod=online returns a PayOS checkoutUrl (confirmation email sent only after webhook PAID); cash skips PayOS and the order starts CONFIRMED+UNPAID (confirmation email sent immediately). Optional Idempotency-Key header caches the response 24h.',
  })
  @ApiHeader({
    name: 'Idempotency-Key',
    required: false,
    description:
      '8-128 chars [A-Za-z0-9_-:.]. Retries return cached response + header Idempotent-Replayed=true.',
  })
  @ApiResponse({ status: 201, type: OrderResponseDto })
  @ApiResponse({
    status: 400,
    description: 'Validation / business rule failed',
  })
  @ApiResponse({ status: 401, description: 'Missing or invalid access token' })
  @ApiResponse({ status: 404, description: 'Vehicle not found' })
  @ApiResponse({ status: 409, description: 'Shift is full' })
  create(
    @CurrentUser() user: IAuthPayload,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    return this.service.createOrder(user.sub, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my orders' })
  @ApiResponse({ status: 200, type: OrderResponseDto, isArray: true })
  list(@CurrentUser() user: IAuthPayload): Promise<OrderResponseDto[]> {
    return this.service.listOwn(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one of my orders' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  getOne(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
  ): Promise<OrderResponseDto> {
    return this.service.getOwn(user.sub, id);
  }

  @Patch(':id/reschedule')
  @ApiOperation({ summary: 'Reschedule one of my orders' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Limit hit or status not allowed' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  @ApiResponse({ status: 409, description: 'New shift is full' })
  reschedule(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: RescheduleOrderDto,
  ): Promise<OrderResponseDto> {
    return this.service.rescheduleOwn(user.sub, id, dto);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancel one of my orders' })
  @ApiResponse({ status: 200, type: OrderResponseDto })
  @ApiResponse({ status: 400, description: 'Order not cancellable' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  cancel(
    @CurrentUser() user: IAuthPayload,
    @Param('id') id: string,
    @Body() dto: CancelOrderDto,
  ): Promise<OrderResponseDto> {
    return this.service.cancelOwn(user.sub, id, dto);
  }
}

/** Public webhook endpoint — no auth, PayOS calls this. */
@ApiTags('payments · webhook')
@Controller('payments')
export class PaymentWebhookController {
  constructor(private readonly service: OrderService) {}

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'PayOS payment webhook',
    description:
      'Signature is verified internally. Idempotent (Redis dedup + DB unique).',
  })
  async webhook(@Body() body: unknown): Promise<{ success: boolean }> {
    await this.service.handleWebhook(body);
    return { success: true };
  }
}

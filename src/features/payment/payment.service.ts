import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Types } from 'mongoose';
import { ServiceTypeRepository } from '../service-type/repositories/service-type.repository';
import { VehicleRepository } from '../vehicle/repositories/vehicle.repository';
import { CreateOrderDto } from './dto/create-order.dto';
import {
  OrderListResponseDto,
  OrderResponseDto,
} from './dto/order-response.dto';
import { QueryOrderDto } from './dto/query-order.dto';
import { OrderStatus } from './entities/order.entity';
import { PayosService } from './payos.service';
import { OrderRepository } from './repositories/order.repository';
import { PaymentTransactionRepository } from './repositories/payment-transaction.repository';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);

  constructor(
    private readonly orderRepository: OrderRepository,
    private readonly transactionRepository: PaymentTransactionRepository,
    private readonly vehicleRepository: VehicleRepository,
    private readonly serviceTypeRepository: ServiceTypeRepository,
    private readonly payosService: PayosService,
    private readonly config: ConfigService,
  ) {}

  async createOrder(
    customerId: string,
    dto: CreateOrderDto,
  ): Promise<OrderResponseDto> {
    const vehicle = await this.vehicleRepository.findByIdForOwner(
      dto.vehicleId,
      customerId,
    );
    if (!vehicle || !vehicle.is_active) {
      throw new NotFoundException('Vehicle not found');
    }

    const serviceType = await this.serviceTypeRepository.findById(
      dto.serviceTypeId,
    );
    if (!serviceType || !serviceType.is_active) {
      throw new BadRequestException('Service type not found or inactive');
    }

    const amount = Math.round(
      parseFloat(serviceType.base_price.toString()),
    );

    const orderCode = this.generateOrderCode();
    const description = `Rua xe ${orderCode}`;

    const order = await this.orderRepository.create({
      customerId: new Types.ObjectId(customerId),
      vehicleId: new Types.ObjectId(dto.vehicleId),
      serviceTypeId: new Types.ObjectId(dto.serviceTypeId),
      orderCode,
      amount,
      description,
      notes: dto.notes,
    });

    const returnUrl = this.config.get<string>('payos.returnUrl')!;
    const cancelUrl = this.config.get<string>('payos.cancelUrl')!;

    try {
      const paymentLink = await this.payosService.createPaymentLink({
        orderCode,
        amount,
        description,
        returnUrl,
        cancelUrl,
        items: [{ name: serviceType.name, quantity: 1, price: amount }],
      });

      const updated = await this.orderRepository.updateById(order._id, {
        checkoutUrl: paymentLink.checkoutUrl,
        paymentLinkId: paymentLink.paymentLinkId,
      });

      this.logger.log('Order created with payment link', {
        orderId: order._id.toString(),
        orderCode,
        customerId,
      });

      return OrderResponseDto.fromDocument(updated!);
    } catch (err) {
      await this.orderRepository.updateById(order._id, {
        status: OrderStatus.CANCELLED,
      });
      this.logger.error('Failed to create PayOS payment link', err);
      throw new BadRequestException('Failed to create payment link. Please try again.');
    }
  }

  async listMyOrders(
    customerId: string,
    query: QueryOrderDto,
  ): Promise<OrderListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = {
      customerId: new Types.ObjectId(customerId),
      status: query.status,
    };

    const [docs, total] = await Promise.all([
      this.orderRepository.findPaginated(filter, page, limit),
      this.orderRepository.countMatching(filter),
    ]);

    return {
      data: docs.map(OrderResponseDto.fromDocument),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async getMyOrder(
    customerId: string,
    id: string,
  ): Promise<OrderResponseDto> {
    const doc = await this.orderRepository.findByIdForOwner(id, customerId);
    if (!doc) throw new NotFoundException('Order not found');
    return OrderResponseDto.fromDocument(doc);
  }

  async cancelMyOrder(
    customerId: string,
    id: string,
  ): Promise<OrderResponseDto> {
    const doc = await this.orderRepository.findByIdForOwner(id, customerId);
    if (!doc) throw new NotFoundException('Order not found');
    if (doc.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel an order with status ${doc.status}`,
      );
    }

    try {
      await this.payosService.cancelPaymentLink(
        doc.order_code,
        'Customer cancelled',
      );
    } catch {
      // PayOS cancellation may fail if the link already expired — proceed anyway
    }

    const updated = await this.orderRepository.updateById(doc._id, {
      status: OrderStatus.CANCELLED,
    });

    this.logger.log('Customer cancelled order', {
      orderId: id,
      orderCode: doc.order_code,
      customerId,
    });

    return OrderResponseDto.fromDocument(updated!);
  }

  async handleWebhook(body: unknown): Promise<void> {
    let webhookData: Awaited<ReturnType<typeof this.payosService.verifyWebhookData>>;
    try {
      webhookData = await this.payosService.verifyWebhookData(
        body as Parameters<typeof this.payosService.verifyWebhookData>[0],
      );
    } catch {
      this.logger.warn('Invalid PayOS webhook signature received');
      return;
    }

    const { orderCode, amount, transactionDateTime, reference, code, desc } =
      webhookData;

    const order = await this.orderRepository.findByOrderCode(
      Number(orderCode),
    );
    if (!order) {
      this.logger.warn('Webhook received for unknown orderCode', { orderCode });
      return;
    }

    const isPaid = code === '00';
    const newStatus = isPaid ? OrderStatus.PAID : OrderStatus.CANCELLED;

    if (order.status === OrderStatus.PENDING) {
      await this.orderRepository.updateById(order._id, {
        status: newStatus,
      });
    }

    await this.transactionRepository.create({
      orderId: order._id,
      orderCode: Number(orderCode),
      amount: Number(amount),
      status: desc ?? code,
      payosTransactionId: reference,
      transactionDatetime: transactionDateTime
        ? new Date(transactionDateTime)
        : undefined,
      rawData: body as Record<string, unknown>,
    });

    this.logger.log('Webhook processed', {
      orderCode,
      newStatus,
      orderId: order._id.toString(),
    });
  }

  // ---------- admin ----------

  async adminListOrders(query: QueryOrderDto): Promise<OrderListResponseDto> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: { customerId?: Types.ObjectId; status?: OrderStatus } = {};
    if (query.customerId)
      filter.customerId = new Types.ObjectId(query.customerId);
    if (query.status) filter.status = query.status;

    const [docs, total] = await Promise.all([
      this.orderRepository.findPaginated(filter, page, limit),
      this.orderRepository.countMatching(filter),
    ]);

    return {
      data: docs.map(OrderResponseDto.fromDocument),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async adminGetOrder(id: string): Promise<OrderResponseDto> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid order id');
    }
    const doc = await this.orderRepository.findById(id);
    if (!doc) throw new NotFoundException('Order not found');
    return OrderResponseDto.fromDocument(doc);
  }

  private generateOrderCode(): number {
    // PayOS orderCode must be a positive integer ≤ Number.MAX_SAFE_INTEGER
    // Using timestamp (ms) + 3 random digits to avoid collisions
    const ts = Date.now();
    const rand = Math.floor(Math.random() * 1000);
    return parseInt(`${ts}${rand}`.slice(-13), 10);
  }
}

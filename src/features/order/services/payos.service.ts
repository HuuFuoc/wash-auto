import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PayOS } from '@payos/node';
import type {
  CreatePaymentLinkRequest,
  CreatePaymentLinkResponse,
  PaymentLink,
  Webhook,
  WebhookData,
} from '@payos/node';

@Injectable()
export class PayosService implements OnModuleInit {
  private readonly logger = new Logger(PayosService.name);
  private client!: PayOS;

  constructor(private readonly config: ConfigService) {}

  onModuleInit(): void {
    this.client = new PayOS({
      clientId: this.config.getOrThrow<string>('payos.clientId'),
      apiKey: this.config.getOrThrow<string>('payos.apiKey'),
      checksumKey: this.config.getOrThrow<string>('payos.checksumKey'),
    });
    this.logger.log('PayOS client initialized');
  }

  createPaymentLink(
    data: CreatePaymentLinkRequest,
  ): Promise<CreatePaymentLinkResponse> {
    return this.client.paymentRequests.create(data);
  }

  getPaymentInfo(orderCode: number): Promise<PaymentLink> {
    return this.client.paymentRequests.get(orderCode);
  }

  cancelPaymentLink(
    orderCode: number,
    reason = 'Customer cancelled',
  ): Promise<PaymentLink> {
    return this.client.paymentRequests.cancel(orderCode, reason);
  }

  verifyWebhookData(body: Webhook): Promise<WebhookData> {
    return this.client.webhooks.verify(body);
  }
}

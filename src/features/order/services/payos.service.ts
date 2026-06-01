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
    // Fire-and-forget: registering the webhook makes PayOS push payment
    // settlements to us. Not awaited so a slow/failed confirm never blocks
    // module init (which, on serverless, sits on the request path).
    void this.registerWebhook();
  }

  /**
   * Registers our webhook URL with PayOS so it sends server-to-server payment
   * notifications. PayOS validates the URL by pinging it once; our endpoint
   * must answer 200. Idempotent - safe to re-run on every cold start. Failures
   * are logged, never thrown, so the app boots even if PayOS is unreachable.
   */
  private async registerWebhook(): Promise<void> {
    const webhookUrl = this.config.get<string>('payos.webhookUrl');
    if (!webhookUrl) {
      this.logger.warn(
        'PAYOS_WEBHOOK_URL not set - skipping webhook registration. Online ' +
          'orders will stay UNPAID because PayOS has nowhere to send the ' +
          'payment notification.',
      );
      return;
    }
    try {
      const result = await this.client.webhooks.confirm(webhookUrl);
      this.logger.log(`PayOS webhook registered: ${result.webhookUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `PayOS webhook registration failed for ${webhookUrl}: ${msg}`,
      );
    }
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

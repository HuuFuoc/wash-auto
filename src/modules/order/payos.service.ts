import { PayOS } from '@payos/node';
import type {
  CreatePaymentLinkRequest,
  CreatePaymentLinkResponse,
  PaymentLink,
  Webhook,
  WebhookData,
} from '@payos/node';
import { config } from '../../config';

// Replaces features/order/services/payos.service.ts. Nest's onModuleInit →
// constructor; ConfigService → config.payos; Logger → console.
export class PayosService {
  private readonly client: PayOS;

  constructor() {
    this.client = new PayOS({
      clientId: config.payos.clientId,
      apiKey: config.payos.apiKey,
      checksumKey: config.payos.checksumKey,
    });
    console.log('[PayosService] PayOS client initialized');
    // Fire-and-forget so a slow/failed confirm never blocks boot.
    void this.registerWebhook();
  }

  private async registerWebhook(): Promise<void> {
    // Fail-closed flag gate. Only the scope that explicitly opts in registers
    // the webhook with PayOS. WHY a dedicated flag and NOT NODE_ENV: Vercel sets
    // NODE_ENV=production on Preview deployments too, so a NODE_ENV check would
    // re-register on every preview and hijack the production webhook URL. The
    // flag must be set to the literal string 'true' (prod scope at Phase 5
    // cutover) for registration to happen; absent/anything-else → skip.
    if (process.env.ENABLE_PAYOS_WEBHOOK !== 'true') {
      console.log(
        '[PayosService] ENABLE_PAYOS_WEBHOOK !== "true" - skipping webhook ' +
          'registration (no outward PayOS call). Set ENABLE_PAYOS_WEBHOOK=true ' +
          'in the prod scope to register.',
      );
      return;
    }
    const webhookUrl = config.payos.webhookUrl;
    if (!webhookUrl) {
      console.warn(
        '[PayosService] PAYOS_WEBHOOK_URL not set - skipping webhook ' +
          'registration. Online orders will stay UNPAID because PayOS has ' +
          'nowhere to send the payment notification.',
      );
      return;
    }
    try {
      const result = await this.client.webhooks.confirm(webhookUrl);
      console.log(`[PayosService] PayOS webhook registered: ${result.webhookUrl}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[PayosService] PayOS webhook registration failed for ${webhookUrl}: ${msg}`,
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

// Lazy singleton — constructing PayOS pings PayOS to register the webhook, so
// build it once when the order router first imports it.
let instance: PayosService | null = null;
export function getPayosService(): PayosService {
  if (!instance) instance = new PayosService();
  return instance;
}

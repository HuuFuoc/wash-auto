import { registerAs } from '@nestjs/config';

export default registerAs('payos', () => ({
  clientId: process.env.PAYOS_CLIENT_ID ?? '',
  apiKey: process.env.PAYOS_API_KEY ?? '',
  checksumKey: process.env.PAYOS_CHECKSUM_KEY ?? '',
  returnUrl:
    process.env.PAYOS_RETURN_URL ?? 'http://localhost:3000/payment/success',
  cancelUrl:
    process.env.PAYOS_CANCEL_URL ?? 'http://localhost:3000/payment/cancel',
  // Public URL PayOS calls server-to-server to settle payments. Must point at
  // the backend (with the global `/api` prefix), e.g.
  // https://<backend-domain>/api/payments/webhook. Without it orders stay
  // UNPAID because the success page is only a browser redirect.
  webhookUrl: process.env.PAYOS_WEBHOOK_URL ?? '',
}));

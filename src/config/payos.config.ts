import { registerAs } from '@nestjs/config';

export default registerAs('payos', () => ({
  clientId: process.env.PAYOS_CLIENT_ID ?? '',
  apiKey: process.env.PAYOS_API_KEY ?? '',
  checksumKey: process.env.PAYOS_CHECKSUM_KEY ?? '',
  returnUrl:
    process.env.PAYOS_RETURN_URL ?? 'http://localhost:3000/payment/success',
  cancelUrl:
    process.env.PAYOS_CANCEL_URL ?? 'http://localhost:3000/payment/cancel',
}));

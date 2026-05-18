import { registerAs } from '@nestjs/config';

const defaultCorsOrigins = [
  'https://wash-auto.vercel.app',
  'https://wave-wash.vercel.app',
];
const localDevCorsOrigins = [
  /^http:\/\/localhost:\d+$/,
  /^http:\/\/127\.0\.0\.1:\d+$/,
];

const parseCorsOrigins = (origins: string): string[] =>
  origins
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export default registerAs('app', () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  globalPrefix: process.env.GLOBAL_API_PREFIX ?? 'api',
  corsOrigins: Array.from(
    new Set([
      ...defaultCorsOrigins,
      ...localDevCorsOrigins,
      ...parseCorsOrigins(process.env.CORS_ORIGINS ?? ''),
    ]),
  ),
}));

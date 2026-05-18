import { registerAs } from '@nestjs/config';

const defaultCorsOrigins = ['https://wave-wash.vercel.app'];

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
      ...parseCorsOrigins(process.env.CORS_ORIGINS ?? ''),
    ]),
  ),
}));

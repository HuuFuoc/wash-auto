import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  accessSecret: process.env.JWT_ACCESS_SECRET ?? '',
  accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
  refreshSecret: process.env.JWT_REFRESH_SECRET ?? '',
  refreshTtl: process.env.JWT_REFRESH_TTL ?? '7d',
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS ?? '10', 10),
}));

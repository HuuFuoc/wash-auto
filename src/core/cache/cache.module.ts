import { Global, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): Redis => {
        const url = configService.getOrThrow<string>('cache.redisUrl');
        const logger = new Logger('RedisClient');
        const client = new Redis(url, { lazyConnect: false });
        client.on('connect', () => logger.log('Redis connected'));
        client.on('error', (err: Error) =>
          logger.error('Redis error', err.message),
        );
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class CacheModule implements OnModuleDestroy {
  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleDestroy(): Promise<void> {
    const client = this.moduleRef.get<Redis>(REDIS_CLIENT, { strict: false });
    if (client) {
      await client.quit();
    }
  }
}

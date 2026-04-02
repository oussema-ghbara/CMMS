import { Global, Module, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (cfg: ConfigService): Redis => {
        const logger = new Logger('RedisModule');
        const client = new Redis(cfg.getOrThrow<string>('REDIS_URL'), {
          lazyConnect: false,
          maxRetriesPerRequest: 3,
        });
        client.on('connect', () => logger.log('Redis connection established'));
        client.on('error', (err: Error) => logger.error('Redis error', err.message));
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

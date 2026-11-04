import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export const DEFAULT_REDIS = 'redis://localhost:6379';

/** One shared Redis connection: short-lived data such as login codes and limits. */
@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.get('REDIS_URL', DEFAULT_REDIS), { lazyConnect: true, maxRetriesPerRequest: 1 });
    // A dropped connection must not crash the server; calls fail and /api/health shows "redis: down".
    this.client.on('error', () => undefined);
  }

  onModuleDestroy() {
    this.client.disconnect();
  }
}

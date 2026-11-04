import { Injectable } from '@nestjs/common';
import { SHARED_VERSION, type HealthReport } from '@pawpal/shared';
import { DbService } from '../db/db.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis] = await Promise.all([this.pingDatabase(), this.pingRedis()]);
    return { status: database === 'up' && redis === 'up' ? 'ok' : 'degraded', database, redis, version: SHARED_VERSION };
  }

  private async pingDatabase(): Promise<'up' | 'down'> {
    try {
      await this.db.pool.query('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }

  private async pingRedis(): Promise<'up' | 'down'> {
    try {
      return (await this.redis.client.ping()) === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}

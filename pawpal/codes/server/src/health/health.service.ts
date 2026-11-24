import { Inject, Injectable } from '@nestjs/common';
import { SHARED_VERSION, type HealthReport } from '@pawpal/shared';
import { DbService } from '../db/db.service';
import { PAYMENT_GATEWAY, type PaymentGateway } from '../payments/gateway';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class HealthService {
  constructor(
    private readonly db: DbService,
    private readonly redis: RedisService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  async check(): Promise<HealthReport> {
    const [database, redis, gateway] = await Promise.all([this.pingDatabase(), this.pingRedis(), this.pingGateway()]);
    const ok = database === 'up' && redis === 'up' && gateway === 'up';
    return { status: ok ? 'ok' : 'degraded', database, redis, gateway, version: SHARED_VERSION };
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

  /** R61-2: the uptime monitor (E15-2) reads this, so a gateway outage alerts too. */
  private async pingGateway(): Promise<'up' | 'down'> {
    try {
      return (await this.gateway.ping()) ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}

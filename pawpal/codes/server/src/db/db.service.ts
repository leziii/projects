import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, types, type PoolClient } from 'pg';
import { MIGRATIONS } from './migrations';

export const DEFAULT_DATABASE = 'postgres://pawpal:pawpal@localhost:5433/pawpal';

// BIGINT ids and counts fit safely in a JS number. Timestamps stay as text; queries format them.
types.setTypeParser(types.builtins.INT8, (v) => parseInt(v, 10));
types.setTypeParser(types.builtins.TIMESTAMPTZ, (v) => v);

/** Formats a timestamp column as "2026-10-25 15:46:54.123" in Malaysia time. */
export const ts = (column: string) => `to_char(${column}, 'YYYY-MM-DD HH24:MI:SS.MS')`;

const MIGRATE_LOCK = 4_242_001;

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;
  private readonly log = new Logger('Db');

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.get('DATABASE_URL', DEFAULT_DATABASE),
      max: 10,
      // All PawPal times are Malaysia time (UTC+8), whatever the database server's own time zone is.
      options: '-c TimeZone=Asia/Kuala_Lumpur',
    });
    // An idle connection that drops must not crash the server.
    this.pool.on('error', (err) => this.log.warn(`Idle database connection lost: ${err.message}`));
  }

  /** Runs fn in one transaction; rolls back on any error. */
  async tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async onModuleInit() {
    try {
      await this.migrate();
    } catch (err) {
      // The server still starts so /api/health can report "database: down".
      this.log.error(`Migrations not applied: ${(err as Error).message}`);
    }
  }

  /** Applies new migrations once; an advisory lock stops two servers migrating at the same time. */
  private async migrate() {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [MIGRATE_LOCK]);
      await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(64) PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
      const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
      const done = new Set(rows.map((r) => r.id));
      for (const m of MIGRATIONS.filter((m) => !done.has(m.id))) {
        await client.query('BEGIN');
        try {
          for (const sql of m.sql) await client.query(sql);
          await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [m.id]);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        }
        this.log.log(`Applied ${m.id}`);
      }
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATE_LOCK]).catch(() => undefined);
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}

/** Postgres error code for a unique key that already exists. */
export function isDuplicate(err: unknown): boolean {
  return (err as { code?: string }).code === '23505';
}

import { Injectable } from '@nestjs/common';
import { checkReason, RuleError, type Actor, type ActorType, type StatusChange } from '@pawpal/shared';
import type { PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';

export interface ChangeInput {
  entity: string;
  entityId: number;
  from: string | null;
  to: string;
  actor: Actor;
  reason: string;
}

interface HistoryRow {
  id: number;
  entity: string;
  entity_id: number;
  from_status: string | null;
  to_status: string;
  actor_type: ActorType;
  actor_id: string | null;
  reason: string;
  created: string;
}

const ENTITY_PATTERN = /^[a-z_]{1,32}$/;

/**
 * Writes one history row per status change (rule G9).
 * Always called with the same client as the change, so both are saved or neither is.
 */
@Injectable()
export class HistoryService {
  constructor(private readonly db: DbService) {}

  async record(client: PoolClient, c: ChangeInput): Promise<void> {
    const reason = checkReason(c.actor, c.reason);
    await client.query(
      'INSERT INTO status_history (entity, entity_id, from_status, to_status, actor_type, actor_id, reason) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [c.entity, c.entityId, c.from, c.to, c.actor.type, c.actor.id ?? null, reason],
    );
  }

  /** Oldest first. */
  async list(entity: string, entityId: number): Promise<StatusChange[]> {
    if (!ENTITY_PATTERN.test(entity)) throw new RuleError('BAD_ENTITY', 'Unknown entity');
    const { rows } = await this.db.pool.query<HistoryRow>(
      `SELECT *, ${ts('created_at')} AS created FROM status_history WHERE entity = $1 AND entity_id = $2 ORDER BY id`,
      [entity, entityId],
    );
    return rows.map((r) => ({
      id: r.id,
      entity: r.entity,
      entityId: r.entity_id,
      fromStatus: r.from_status,
      toStatus: r.to_status,
      actorType: r.actor_type,
      actorId: r.actor_id,
      reason: r.reason,
      createdAt: r.created,
    }));
  }
}

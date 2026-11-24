import { Injectable } from '@nestjs/common';
import {
  ACTION_ENTITY,
  ACTION_LOG_RULES,
  actionChangeText,
  actionLink,
  actionWhat,
  checkActionQuery,
  entitiesOf,
  parseMoneyRef,
  type ActionLogPage,
} from '@pawpal/shared';
import { DbService, ts } from '../db/db.service';

interface Row {
  id: string;
  entity: string;
  entity_id: string;
  from_status: string | null;
  to_status: string;
  actor_id: string;
  reason: string;
  at: string;
  order_id: string | null;
  ref: string | null;
  version: string | null;
  total: number;
}

/** E14-4 (round 60): every admin action from the history, newest first. Read only (R60-3). */
@Injectable()
export class ActionLogService {
  constructor(private readonly db: DbService) {}

  async list(input: Record<string, unknown>): Promise<ActionLogPage> {
    const q = checkActionQuery(input);
    const where = ["h.actor_type = 'admin'"];
    const args: unknown[] = [];
    const arg = (v: unknown) => {
      args.push(v);
      return `$${args.length}`;
    };
    if (q.admin) where.push(`h.actor_id = ${arg(q.admin)}`);
    if (q.kind) where.push(`h.entity = ANY (${arg(entitiesOf(q.kind))})`);
    if (q.from) where.push(`h.created_at >= (${arg(q.from)}::date::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')`);
    if (q.to) where.push(`h.created_at < ((${arg(q.to)}::date + 1)::timestamp AT TIME ZONE 'Asia/Kuala_Lumpur')`);
    const size = ACTION_LOG_RULES.pageSize;
    const { rows } = await this.db.pool.query<Row>(
      `SELECT h.id, h.entity, h.entity_id, h.from_status, h.to_status, h.actor_id, h.reason, ${ts('h.created_at')} AS at,
         COALESCE(pr.order_id, s.order_id, c.order_id) AS order_id, p.ref, rv.version, (count(*) OVER ())::int AS total
       FROM status_history h
       LEFT JOIN problem_reports pr ON h.entity = 'problem' AND pr.id = h.entity_id
       LEFT JOIN substitutes s ON h.entity = 'substitute' AND s.id = h.entity_id
       LEFT JOIN cases c ON h.entity = 'case' AND c.id = h.entity_id
       LEFT JOIN payments p ON h.entity IN ('money', 'payment') AND p.id = h.entity_id
       LEFT JOIN rule_versions rv ON h.entity = 'rule_version' AND rv.id = h.entity_id
       WHERE ${where.join(' AND ')}
       ORDER BY h.created_at DESC, h.id DESC LIMIT ${size} OFFSET ${arg((q.page - 1) * size)}`,
      args,
    );
    const admins = await this.db.pool.query<{ actor_id: string }>(
      "SELECT DISTINCT actor_id FROM status_history WHERE actor_type = 'admin' AND actor_id IS NOT NULL ORDER BY actor_id",
    );
    return {
      rows: rows.map((r) => {
        const id = Number(r.entity_id);
        const base = r.ref ? (parseMoneyRef(r.ref)?.base ?? null) : null;
        return {
          id: Number(r.id),
          at: r.at,
          admin: r.actor_id,
          kind: ACTION_ENTITY[r.entity]?.kind ?? null,
          what: actionWhat(r.entity, id, r.version ?? base),
          change: actionChangeText(r.from_status, r.to_status),
          reason: r.reason,
          link: actionLink(r.entity, id, { orderId: r.order_id === null ? null : Number(r.order_id), moneyBase: base }),
        };
      }),
      total: rows[0]?.total ?? 0,
      page: q.page,
      admins: admins.rows.map((a) => a.actor_id),
    };
  }
}

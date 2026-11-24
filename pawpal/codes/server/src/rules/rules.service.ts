import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DEFAULT_RULES,
  checkReason,
  checkRuleEdit,
  klDate,
  ruleDiff,
  ruleValues,
  ruleVersionStates,
  withValues,
  type AdminUser,
  type RuleSet,
  type RuleVersion,
  type RulesAdmin,
} from '@pawpal/shared';
import type { Pool, PoolClient } from 'pg';
import { DbService, ts } from '../db/db.service';
import { HistoryService } from '../history/history.service';

interface Row {
  id: number;
  version: string;
  effective_from: string;
  rules: RuleSet;
  reason: string;
  admin: string | null;
  created: string;
  withdrawn: string | null;
  withdraw_reason: string | null;
}

/** Capacity, accept windows and booking hours always come from code (R59-2). */
const loaded = (r: Row): RuleSet => withValues(ruleValues({ ...DEFAULT_RULES, ...r.rules }), r.version);

/** E14-3 (round 59): rule versions. New orders use the one in effect today (KL); an order keeps its own. */
@Injectable()
export class RulesService {
  private readonly log = new Logger(RulesService.name);
  /** Versions never change once saved, so each is read once. */
  private readonly cache = new Map<string, RuleSet>();

  constructor(
    private readonly db: DbService,
    private readonly history: HistoryService,
  ) {}

  /** The version for new orders and the prices owners and caregivers see now. */
  async current(now = new Date(), q: Pool | PoolClient = this.db.pool): Promise<RuleSet> {
    const { rows } = await q.query<Row>(
      `SELECT id, version, effective_from::text, rules FROM rule_versions WHERE withdrawn_at IS NULL AND effective_from <= $1 ORDER BY effective_from DESC, id DESC LIMIT 1`,
      [klDate(now)],
    );
    return rows[0] ? loaded(rows[0]) : DEFAULT_RULES;
  }

  /** R59-4: the rules an order was paid under. */
  async forVersion(version: string): Promise<RuleSet> {
    const hit = this.cache.get(version);
    if (hit) return hit;
    const { rows } = await this.db.pool.query<Row>('SELECT id, version, rules FROM rule_versions WHERE version = $1', [version]);
    if (!rows[0]) {
      this.log.warn(`Rule version ${version} not found, using the code defaults`);
      return DEFAULT_RULES;
    }
    const r = loaded(rows[0]);
    this.cache.set(version, r);
    return r;
  }

  async forOrder(orderId: number | string): Promise<RuleSet> {
    const { rows } = await this.db.pool.query<{ rules_version: string }>('SELECT rules_version FROM orders WHERE id = $1', [orderId]);
    return rows[0] ? this.forVersion(rows[0].rules_version) : DEFAULT_RULES;
  }

  /** A15: the version in effect, the one waiting, and every version with what it changed. */
  async admin(now = new Date()): Promise<RulesAdmin> {
    const rows = await this.rows();
    const states = ruleVersionStates(
      rows.map((r) => ({ version: r.version, effectiveFrom: r.effective_from, withdrawn: !!r.withdrawn })),
      klDate(now),
    );
    // Each version's changes are against the live version before it (by start date), or the in-effect one for a withdrawn version.
    const live = rows.filter((r) => !r.withdrawn);
    const versions: RuleVersion[] = rows.map((r) => {
      const prev = r.withdrawn ? live.filter((x) => x.effective_from <= r.effective_from && x.id < r.id).pop() : live[live.indexOf(r) - 1];
      const rules = loaded(r);
      return {
        version: r.version,
        effectiveFrom: r.effective_from,
        state: states.get(r.version) ?? 'past',
        reason: r.reason,
        admin: r.admin ?? 'System',
        createdAt: r.created,
        withdrawnAt: r.withdrawn,
        withdrawReason: r.withdraw_reason,
        changes: prev ? ruleDiff(loaded(prev), rules) : [],
        rules,
      };
    });
    const current = versions.find((v) => v.state === 'in_effect');
    if (!current) throw new NotFoundException({ code: 'NO_RULES', message: 'No rule version is in effect' });
    return {
      current,
      waiting: versions.find((v) => v.state === 'waiting') ?? null,
      history: [...versions].sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || b.createdAt.localeCompare(a.createdAt)),
    };
  }

  /** R59-3, R59-5, R59-6: saves a new version from a later date; one already waiting is replaced. */
  async save(admin: AdminUser, body: Record<string, unknown>, now = new Date()): Promise<RulesAdmin> {
    const today = klDate(now);
    await this.db.tx(async (client) => {
      // One save at a time, so two admins cannot both leave a waiting version.
      await client.query('SELECT pg_advisory_xact_lock(59)');
      const current = await this.current(now, client);
      const edit = checkRuleEdit(body ?? {}, current, today);
      const actor = { type: 'admin' as const, id: admin.username };
      checkReason(actor, edit.reason);
      const { rows: waiting } = await client.query<{ id: number; version: string }>(
        'SELECT id, version FROM rule_versions WHERE withdrawn_at IS NULL AND effective_from > $1',
        [today],
      );
      const { rows: seq } = await client.query<{ n: string }>("SELECT nextval(pg_get_serial_sequence('rule_versions', 'id')) AS n");
      const id = Number(seq[0].n);
      const version = `v${id}`;
      for (const w of waiting) {
        const why = `Replaced by ${version}`;
        await client.query('UPDATE rule_versions SET withdrawn_at = now(), withdraw_reason = $2 WHERE id = $1', [w.id, why]);
        await this.history.record(client, { entity: 'rule_version', entityId: w.id, from: 'waiting', to: 'withdrawn', actor, reason: why });
      }
      await client.query('INSERT INTO rule_versions (id, version, effective_from, rules, reason, admin) VALUES ($1, $2, $3, $4, $5, $6)', [
        id,
        version,
        edit.effectiveFrom,
        JSON.stringify(withValues(edit.values, version)),
        edit.reason,
        admin.username,
      ]);
      await this.history.record(client, { entity: 'rule_version', entityId: id, from: null, to: 'waiting', actor, reason: edit.reason });
      this.log.log(`Admin ${admin.username} saved rule version ${version}`);
    });
    return this.admin(now);
  }

  /** R59-5: a version that has not started can be withdrawn; one in effect cannot. */
  async withdraw(admin: AdminUser, version: string, body: { reason?: unknown }, now = new Date()): Promise<RulesAdmin> {
    const actor = { type: 'admin' as const, id: admin.username };
    const reason = checkReason(actor, typeof body?.reason === 'string' ? body.reason : '');
    await this.db.tx(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(59)');
      const { rows } = await client.query<{ id: number; effective_from: string; withdrawn_at: string | null }>(
        'SELECT id, effective_from::text, withdrawn_at FROM rule_versions WHERE version = $1',
        [version],
      );
      const r = rows[0];
      if (!r) throw new NotFoundException({ code: 'NO_VERSION', message: 'No such rule version' });
      if (r.withdrawn_at || r.effective_from <= klDate(now)) {
        throw new ConflictException({ code: 'NOT_WAITING', message: 'Only a version that has not started can be withdrawn' });
      }
      await client.query('UPDATE rule_versions SET withdrawn_at = now(), withdraw_reason = $2 WHERE id = $1', [r.id, reason]);
      await this.history.record(client, { entity: 'rule_version', entityId: r.id, from: 'waiting', to: 'withdrawn', actor, reason });
    });
    return this.admin(now);
  }

  private async rows(): Promise<Row[]> {
    const { rows } = await this.db.pool.query<Row>(
      `SELECT id, version, effective_from::text, rules, reason, admin, ${ts('created_at')} AS created, ${ts('withdrawn_at')} AS withdrawn, withdraw_reason
       FROM rule_versions ORDER BY effective_from, id`,
    );
    return rows;
  }
}

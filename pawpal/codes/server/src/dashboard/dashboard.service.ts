import { Injectable } from '@nestjs/common';
import { PET_CHECK_STATUSES, moneyFailed, moneyLate, queuesFor, waitingCase, waitingException, type AdminUser, type QueueCount, type QueueKey } from '@pawpal/shared';
import { CasesService } from '../bookings/cases.service';
import { ExceptionsService } from '../bookings/exceptions.service';
import { MoneyService } from '../bookings/money.service';
import { ProblemsService } from '../bookings/problems.service';
import { DbService } from '../db/db.service';

/** E14-1 A02 (round 57): how many rows wait on each queue this admin can open. */
@Injectable()
export class DashboardService {
  constructor(
    private readonly db: DbService,
    private readonly exceptions: ExceptionsService,
    private readonly cases: CasesService,
    private readonly problems: ProblemsService,
    private readonly money: MoneyService,
  ) {}

  async queues(admin: AdminUser): Promise<QueueCount[]> {
    const keys = queuesFor(admin.pages);
    const out: QueueCount[] = [];
    let money: Awaited<ReturnType<MoneyService['list']>> | null = null;
    for (const key of keys) {
      if (key.startsWith('money') && !money) money = await this.money.list();
      out.push({ key, count: await this.count(key, money ?? []) });
    }
    return out;
  }

  /** R57-2: the same rule as each list. Caregivers and pets count in SQL with the lists' own conditions (those lists open every file). */
  private async count(key: QueueKey, money: Awaited<ReturnType<MoneyService['list']>>): Promise<number> {
    switch (key) {
      case 'caregivers': {
        const { rows } = await this.db.pool.query<{ n: number }>(
          "SELECT (SELECT count(*) FROM caregiver_applications WHERE status = 'submitted') + (SELECT count(*) FROM caregiver_profile_changes WHERE status = 'pending') AS n",
        );
        return Number(rows[0].n);
      }
      case 'pets': {
        const { rows } = await this.db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM pets WHERE status = ANY ($1)', [PET_CHECK_STATUSES]);
        return rows[0].n;
      }
      case 'exceptions':
        return (await this.exceptions.list()).filter(waitingException).length;
      case 'cases':
        return (await this.cases.adminList()).filter(waitingCase).length + (await this.problems.adminList()).filter(waitingCase).length;
      case 'money_failed':
        return money.filter(moneyFailed).length;
      case 'money_late':
        return money.filter(moneyLate).length;
    }
  }
}

import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RuleError, quoteVisit, type AdminUser, type PetKind, type RuleSet, type RulesAdmin, type ServiceLevel, type VisitQuote } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { DbService } from '../db/db.service';
import { RulesService } from './rules.service';

interface QuoteBody {
  pets?: unknown;
  level?: unknown;
  overtimeUnits?: unknown;
}

const PET_KINDS: PetKind[] = ['cat', 'dog'];
const LEVELS: ServiceLevel[] = ['basic', 'upgrade'];

@Controller()
export class RulesController {
  constructor(private readonly rules: RulesService) {}

  /** The version in effect today (R59-7): owners and caregivers see new prices from its start date. */
  @Get('rules')
  current(): Promise<RuleSet> {
    return this.rules.current();
  }

  @Post('pricing/quote')
  @HttpCode(200)
  async quote(@Body() body: QuoteBody): Promise<VisitQuote> {
    const { pets, level, overtimeUnits = 0 } = body ?? {};
    if (!Array.isArray(pets) || !pets.every((p) => PET_KINDS.includes(p))) {
      throw new RuleError('BAD_PETS', 'pets must be a list of "cat" or "dog"');
    }
    if (!LEVELS.includes(level as ServiceLevel)) throw new RuleError('BAD_LEVEL', 'level must be "basic" or "upgrade"');
    if (typeof overtimeUnits !== 'number') throw new RuleError('OVERTIME_INVALID', 'overtimeUnits must be a number');
    return quoteVisit(pets as PetKind[], level as ServiceLevel, overtimeUnits, await this.rules.current());
  }
}

/** E14-3 A15 (round 59): rule versions. */
@Controller('admin/rules')
@UseGuards(AdminGuard)
@ForPage('rules')
export class AdminRulesController {
  constructor(private readonly rules: RulesService) {}

  @Get()
  list(): Promise<RulesAdmin> {
    return this.rules.admin();
  }

  @Post()
  @HttpCode(200)
  save(@CurrentAdmin() admin: AdminUser, @Body() body: Record<string, unknown>): Promise<RulesAdmin> {
    return this.rules.save(admin, body ?? {});
  }

  @Post(':version/withdraw')
  @HttpCode(200)
  withdraw(@CurrentAdmin() admin: AdminUser, @Param('version') version: string, @Body() body: { reason?: unknown }): Promise<RulesAdmin> {
    return this.rules.withdraw(admin, version, body ?? {});
  }
}

/** Test tool: start the waiting version today, so a hand test need not wait for midnight. 404 in production. */
@Controller('dev/rules')
export class RulesDevController {
  constructor(
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  @Post('start-now')
  @HttpCode(200)
  async startNow(): Promise<{ version: string | null }> {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
    const { rows } = await this.db.pool.query<{ version: string }>(
      "UPDATE rule_versions SET effective_from = (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date WHERE withdrawn_at IS NULL AND effective_from > (now() AT TIME ZONE 'Asia/Kuala_Lumpur')::date RETURNING version",
    );
    return { version: rows[0]?.version ?? null };
  }
}

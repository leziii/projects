import { BadRequestException, Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AdminUser, SubstituteCandidate, SubstituteOffer, User } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { DbService } from '../db/db.service';
import { SubstitutesService } from './substitutes.service';

/** "0:600,1:660" → [{ index: 0, start: 600 }, { index: 1, start: 660 }] */
const parseVisits = (raw: string | undefined) => {
  const out = (raw ?? '').split(',').filter(Boolean).map((p) => {
    const [index, start] = p.split(':').map(Number);
    return { index, start };
  });
  if (!out.length || out.some((v) => !Number.isInteger(v.index) || !Number.isInteger(v.start))) throw new BadRequestException({ code: 'BAD_VISITS', message: 'Choose at least one visit' });
  return out;
};

/** E12-4 A10 (R52-1, R52-2): find a substitute and offer it to the owner. */
@Controller('admin/exceptions/:orderId/:i')
@UseGuards(AdminGuard)
@ForPage('exceptions')
export class AdminSubstitutesController {
  constructor(private readonly subs: SubstitutesService) {}

  @Get('candidates')
  candidates(@Param('orderId', ParseIntPipe) orderId: number, @Query('visits') visits?: string): Promise<SubstituteCandidate[]> {
    return this.subs.candidates(orderId, parseVisits(visits));
  }

  /** Body { caregiverId, visits: [{ index, start }], reason }. */
  @Post('substitute')
  @HttpCode(200)
  offer(
    @CurrentAdmin() admin: AdminUser,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('i', ParseIntPipe) i: number,
    @Body() body: { caregiverId?: unknown; visits?: unknown; reason?: unknown },
  ): Promise<SubstituteOffer> {
    return this.subs.offer(admin, orderId, i, body ?? {});
  }
}

/** E12-4 O20 (R52-3 … R52-5): the owner approves or declines. */
@Controller('orders/:id/substitute')
@UseGuards(AuthGuard)
export class SubstitutesController {
  constructor(private readonly subs: SubstitutesService) {}

  @Get()
  async get(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<{ offer: SubstituteOffer | null }> {
    return { offer: await this.subs.forOwner(user, id) };
  }

  @Post('approve')
  @HttpCode(200)
  approve(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<SubstituteOffer> {
    return this.subs.approve(user, id);
  }

  @Post('decline')
  @HttpCode(200)
  decline(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<SubstituteOffer> {
    return this.subs.decline(user, id);
  }
}

/** Test tool: the owner's time to answer runs out now (R52-5). */
@Controller('dev')
export class SubstitutesDevController {
  constructor(
    private readonly subs: SubstitutesService,
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  @Post('substitute-due')
  @HttpCode(200)
  async due(@Body() body: { number?: unknown }): Promise<{ number: string; expired: number }> {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
    const number = String(body?.number ?? '').trim();
    const { rowCount } = await this.db.pool.query(
      "UPDATE substitutes s SET answer_by = now() - interval '1 second' FROM orders o WHERE o.id = s.order_id AND o.number = $1 AND s.status = 'waiting'",
      [number],
    );
    if (!rowCount) throw new NotFoundException({ code: 'NO_SUBSTITUTE', message: 'No substitute waiting on that order' });
    return { number, expired: await this.subs.expireDue() };
  }
}

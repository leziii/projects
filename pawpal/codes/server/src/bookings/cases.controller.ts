import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Res, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CASE_RULES, SERVICE_RULES, type AdminCaseRow, type AdminUser, type User, type VisitCase, type VisitReport } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { DbService } from '../db/db.service';
import { CasesService } from './cases.service';

/** E9-2 O17 / O18: the owner confirms the report or raises a problem (round 40). */
@Controller('orders/:id/visits/:i')
@UseGuards(AuthGuard)
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  /** R40-1 */
  @Post('confirm')
  @HttpCode(200)
  confirm(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Param('i', ParseIntPipe) i: number): Promise<VisitReport> {
    return this.cases.confirm(user, id, i);
  }

  /** R40-3: multipart fields "kind" and "description", and up to 3 "photos". */
  @Post('case')
  @HttpCode(200)
  @UseInterceptors(FilesInterceptor('photos', CASE_RULES.maxPhotos, { limits: { fileSize: SERVICE_RULES.photoMaxBytes } }))
  raise(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('i', ParseIntPipe) i: number,
    @Body() body: { kind?: unknown; description?: unknown },
    @UploadedFiles() files?: Express.Multer.File[],
  ): Promise<VisitCase> {
    return this.cases.raise(user, id, i, body ?? {}, (files ?? []).map((f) => f.buffer));
  }

  /** R40-6 */
  @Get('case')
  caseOf(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Param('i', ParseIntPipe) i: number): Promise<VisitCase> {
    return this.cases.caseOf(user, id, i);
  }

  @Get('case/photos/:photoId')
  async photo(
    @CurrentUser() user: User,
    @Param('id', ParseIntPipe) id: number,
    @Param('i', ParseIntPipe) i: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @Res() res: Response,
  ): Promise<void> {
    const { data, mime } = await this.cases.casePhoto(user, id, i, photoId);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }
}

/** R40-4: admin's case list; handling comes with E12-5. */
@Controller('admin/cases')
@UseGuards(AdminGuard)
@ForPage('cases')
export class AdminCasesController {
  constructor(private readonly cases: CasesService) {}

  @Get()
  list(): Promise<AdminCaseRow[]> {
    return this.cases.adminList();
  }

  @Post(':caseId/review')
  @HttpCode(200)
  review(@CurrentAdmin() admin: AdminUser, @Param('caseId', ParseIntPipe) caseId: number): Promise<AdminCaseRow[]> {
    return this.cases.startReview(admin, caseId);
  }
}

/** Test tool: make a sent report 12 h old, then run the auto-confirm (R40-2). */
@Controller('dev')
export class CasesDevController {
  constructor(
    private readonly cases: CasesService,
    private readonly db: DbService,
    private readonly config: ConfigService,
  ) {}

  @Post('report-due')
  @HttpCode(200)
  async reportDue(@Body() body: { number?: unknown; index?: unknown }): Promise<{ number: string; confirmed: number }> {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
    const number = String(body?.number ?? '').trim();
    const index = Number(body?.index ?? 0);
    const { rowCount } = await this.db.pool.query(
      "UPDATE visit_runs r SET reported_at = now() - interval '12 hours 1 minute' FROM orders o WHERE o.id = r.order_id AND o.number = $1 AND r.idx = $2 AND r.status = 'report_sent'",
      [number, index],
    );
    if (!rowCount) throw new NotFoundException({ code: 'NO_REPORT_WAITING', message: 'No sent report waiting on that visit' });
    return { number, confirmed: await this.cases.autoConfirmDue() };
  }
}

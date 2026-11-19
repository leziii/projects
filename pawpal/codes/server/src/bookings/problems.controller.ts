import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { SERVICE_RULES, type AdminProblemRow, type AdminUser, type ProblemReport, type User } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { AuthGuard, CurrentUser, NeedsRole } from '../auth/auth.guard';
import { ProblemsService } from './problems.service';

/** E12-1 S13: the caregiver reports a problem on a visit (round 49). */
@Controller('caregiver/tasks/:orderId/:i/problem')
@UseGuards(AuthGuard)
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @Get()
  @NeedsRole('caregiver')
  async get(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number): Promise<{ report: ProblemReport | null }> {
    return { report: await this.problems.forVisit(user, orderId, i) };
  }

  /** R49-2, R49-3: { kind, description, contacts: [{ method, note, at }] } */
  @Post()
  @HttpCode(200)
  @NeedsRole('caregiver')
  send(
    @CurrentUser() user: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('i', ParseIntPipe) i: number,
    @Body() body: { kind?: unknown; description?: unknown; contacts?: unknown },
  ): Promise<ProblemReport> {
    return this.problems.send(user, orderId, i, body ?? {});
  }

  /** Multipart field "photo", a JPEG or PNG up to 10 MB. */
  @Post('photos')
  @HttpCode(200)
  @NeedsRole('caregiver')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: SERVICE_RULES.photoMaxBytes, files: 1 } }))
  addPhoto(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number, @UploadedFile() file?: Express.Multer.File): Promise<ProblemReport> {
    return this.problems.addPhoto(user, orderId, i, file?.buffer);
  }

  /** R49-3: { method, note } */
  @Post('contacts')
  @HttpCode(200)
  @NeedsRole('caregiver')
  addContact(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number, @Body() body: { method?: unknown; note?: unknown }): Promise<ProblemReport> {
    return this.problems.addContact(user, orderId, i, body ?? {});
  }

  @Get('photos/:photoId')
  @NeedsRole('caregiver')
  async photo(
    @CurrentUser() user: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('i', ParseIntPipe) i: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @Res() res: Response,
  ): Promise<void> {
    const { data, mime } = await this.problems.photo(user, orderId, i, photoId);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }
}

/** R49-4: caregiver reports on the admin Cases page; decisions come with E12-3. */
@Controller('admin/problems')
@UseGuards(AdminGuard)
@ForPage('cases')
export class AdminProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @Get()
  list(): Promise<AdminProblemRow[]> {
    return this.problems.adminList();
  }

  @Post(':id/review')
  @HttpCode(200)
  review(@CurrentAdmin() admin: AdminUser, @Param('id', ParseIntPipe) id: number): Promise<AdminProblemRow[]> {
    return this.problems.startReview(admin, id);
  }
}

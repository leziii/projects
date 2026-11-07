import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { ConfigService } from '@nestjs/config';
import { SERVICE_RULES, type RequestDetail, type RequestList, type TaskList, type User, type VisitTask } from '@pawpal/shared';
import { AuthGuard, CurrentUser, NeedsRole } from '../auth/auth.guard';
import { OrdersService } from './orders.service';
import { RequestsService, type CaregiverHome, type PausedInfo } from './requests.service';

/** Caregiver dashboard (S01) and booking requests (S06). Only approved caregivers in the caregiver role (R14-4). */
@Controller()
@UseGuards(AuthGuard)
export class RequestsController {
  constructor(
    private readonly requests: RequestsService,
    private readonly orders: OrdersService,
  ) {}

  @Get('caregiver/home')
  @NeedsRole('caregiver')
  home(@CurrentUser() user: User): Promise<CaregiverHome> {
    return this.requests.home(user);
  }

  /** E8-1 S08 My tasks; ?date=YYYY-MM-DD within the next 14 days, today by default. */
  @Get('caregiver/tasks')
  @NeedsRole('caregiver')
  tasks(@CurrentUser() user: User, @Query('date') date?: string): Promise<TaskList> {
    return this.requests.tasks(user, date);
  }

  /** E8-2 S09: one visit of an accepted order (`i` = its place in the order). */
  @Get('caregiver/tasks/:orderId/:i')
  @NeedsRole('caregiver')
  visit(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number): Promise<VisitTask> {
    return this.requests.visit(user, orderId, i);
  }

  /** E8-3 "I've arrived" (R35-2). */
  @Post('caregiver/tasks/:orderId/:i/arrive')
  @HttpCode(200)
  @NeedsRole('caregiver')
  arrive(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number): Promise<VisitTask> {
    return this.requests.arrive(user, orderId, i);
  }

  /** E8-3 Pre-authorised: the caregiver confirms entry (R35-3). */
  @Post('caregiver/tasks/:orderId/:i/enter')
  @HttpCode(200)
  @NeedsRole('caregiver')
  enter(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number): Promise<VisitTask> {
    return this.requests.enter(user, orderId, i);
  }

  /** E8-4 S11: tick or untick one checklist item (R36-3). */
  @Post('caregiver/tasks/:orderId/:i/check')
  @HttpCode(200)
  @NeedsRole('caregiver')
  check(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number, @Body() body: { item?: unknown; done?: unknown }): Promise<VisitTask> {
    return this.requests.check(user, orderId, i, body?.item, body?.done);
  }

  /** E8-4 S11: multipart field "photo", a JPEG or PNG up to 10 MB (R36-4). */
  @Post('caregiver/tasks/:orderId/:i/photos')
  @HttpCode(200)
  @NeedsRole('caregiver')
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: SERVICE_RULES.photoMaxBytes, files: 1 } }))
  addPhoto(@CurrentUser() user: User, @Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number, @UploadedFile() file?: Express.Multer.File): Promise<VisitTask> {
    return this.requests.addPhoto(user, orderId, i, file?.buffer);
  }

  @Post('caregiver/tasks/:orderId/:i/photos/:photoId/delete')
  @HttpCode(200)
  @NeedsRole('caregiver')
  deletePhoto(
    @CurrentUser() user: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('i', ParseIntPipe) i: number,
    @Param('photoId', ParseIntPipe) photoId: number,
  ): Promise<VisitTask> {
    return this.requests.deletePhoto(user, orderId, i, photoId);
  }

  @Get('caregiver/tasks/:orderId/:i/photos/:photoId')
  @NeedsRole('caregiver')
  async photo(
    @CurrentUser() user: User,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('i', ParseIntPipe) i: number,
    @Param('photoId', ParseIntPipe) photoId: number,
    @Res() res: Response,
  ): Promise<void> {
    const { data, mime } = await this.requests.photo(user, orderId, i, photoId);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }

  /** Any logged-in user: tells a paused caregiver why (R25-8). */
  @Get('caregiver/paused')
  paused(@CurrentUser() user: User): Promise<PausedInfo> {
    return this.requests.paused(user);
  }

  @Get('requests')
  @NeedsRole('caregiver')
  list(@CurrentUser() user: User): Promise<RequestList> {
    return this.requests.list(user);
  }

  @Get('requests/:id')
  @NeedsRole('caregiver')
  detail(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<RequestDetail> {
    return this.requests.detail(user, id);
  }

  /** S07: accept the whole order (R26-1 … R26-3). */
  @Post('requests/:id/accept')
  @HttpCode(200)
  @NeedsRole('caregiver')
  async accept(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<RequestDetail> {
    await this.orders.accept(user, id);
    return this.requests.detail(user, id);
  }

  /** S07: say no, with a reason the owner never sees (R26-5). */
  @Post('requests/:id/reject')
  @HttpCode(200)
  @NeedsRole('caregiver')
  async reject(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: unknown }): Promise<RequestDetail> {
    await this.orders.reject(user, id, body?.reason);
    return this.requests.detail(user, id);
  }
}

/** Test tool: makes a request's deadline pass now and runs the timeout (R25-5, R27-5) without waiting hours. */
@Controller('dev')
export class RequestsDevController {
  constructor(
    private readonly requests: RequestsService,
    private readonly orders: OrdersService,
    private readonly config: ConfigService,
  ) {}

  @Post('request-expire')
  @HttpCode(200)
  async expire(@Body() body: { number?: unknown }): Promise<{ number: string }> {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
    const done = await this.requests.expireNow(body?.number);
    // R27-5: fail and refund straight away instead of waiting for the 30 s check.
    await this.orders.expireDue();
    return done;
  }

  /** R35-7: a visit starts in 10 minutes, so arrival can be tested now. */
  @Post('visit-soon')
  @HttpCode(200)
  visitSoon(@Body() body: { number?: unknown; index?: unknown }): Promise<{ number: string; date: string; start: number }> {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
    return this.requests.visitSoon(body?.number, body?.index ?? 0);
  }
}

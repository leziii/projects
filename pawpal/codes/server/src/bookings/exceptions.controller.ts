import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, ParseEnumPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AdminExceptionRow, AdminUser, ExceptionDetail } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { ExceptionsService } from './exceptions.service';

/** E12-3 A09 / A10 (round 51): the exception queue and the admin's decision. */
@Controller('admin/exceptions')
@UseGuards(AdminGuard)
@ForPage('exceptions')
export class AdminExceptionsController {
  constructor(private readonly exceptions: ExceptionsService) {}

  @Get()
  list(): Promise<AdminExceptionRow[]> {
    return this.exceptions.list();
  }

  @Get('photos/:kind/:photoId')
  async photo(@Param('kind', new ParseEnumPipe(['problem', 'case'])) kind: 'problem' | 'case', @Param('photoId', ParseIntPipe) photoId: number, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.exceptions.photo(kind, photoId);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }

  @Get(':orderId/:i')
  detail(@Param('orderId', ParseIntPipe) orderId: number, @Param('i', ParseIntPipe) i: number): Promise<ExceptionDetail> {
    return this.exceptions.detail(orderId, i);
  }

  /** R51-3: body { fault, refundPercent, reason }. */
  @Post(':orderId/:i/decide')
  @HttpCode(200)
  decide(
    @CurrentAdmin() admin: AdminUser,
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('i', ParseIntPipe) i: number,
    @Body() body: { fault?: unknown; refundPercent?: unknown; reason?: unknown },
  ): Promise<ExceptionDetail> {
    return this.exceptions.decide(admin, orderId, i, body ?? {});
  }
}

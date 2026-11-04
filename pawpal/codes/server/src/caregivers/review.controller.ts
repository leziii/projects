import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { AdminUser, ReviewRow } from '@pawpal/shared';
import type { Response } from 'express';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { ApplicationsService, type ReviewDetail } from './applications.service';

/** Admin caregiver review (A03/A04, E4-2). */
@Controller('admin/caregivers')
@UseGuards(AdminGuard)
@ForPage('caregivers')
export class ReviewController {
  constructor(private readonly apps: ApplicationsService) {}

  @Get()
  list(@Query('status') status?: string): Promise<ReviewRow[]> {
    return this.apps.reviewList(status);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number): Promise<ReviewDetail> {
    return this.apps.reviewDetail(id);
  }

  @Post(':id/ic')
  @HttpCode(200)
  ic(@CurrentAdmin() admin: AdminUser, @Param('id', ParseIntPipe) id: number): Promise<{ icNumber: string }> {
    return this.apps.showIc(admin, id);
  }

  @Get(':id/files/:fileId')
  async file(@Param('id', ParseIntPipe) id: number, @Param('fileId', ParseIntPipe) fileId: number, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.apps.adminFile(id, fileId);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(@CurrentAdmin() admin: AdminUser, @Param('id', ParseIntPipe) id: number, @Body() body: { status?: unknown; note?: unknown; idChecked?: unknown; certChecked?: unknown }): Promise<ReviewDetail> {
    return this.apps.decide(admin, id, body);
  }
}

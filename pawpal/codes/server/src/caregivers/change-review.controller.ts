import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { AdminUser, CaregiverProfile, ChangeRow } from '@pawpal/shared';
import type { Response } from 'express';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { ProfilesService, type ChangeDetail } from './profiles.service';

/** Admin review of caregiver profile changes (E4-4, R15-4); part of the Caregiver review page. */
@Controller('admin/profile-changes')
@UseGuards(AdminGuard)
@ForPage('caregivers')
export class ChangeReviewController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  list(): Promise<ChangeRow[]> {
    return this.profiles.changeList();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number): Promise<ChangeDetail> {
    return this.profiles.changeDetail(id);
  }

  /** ?which=pending (the new photo) or current. */
  @Get(':id/photo')
  async photo(@Param('id', ParseIntPipe) id: number, @Query('which') which: string, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.profiles.adminPhoto(id, which);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(@CurrentAdmin() admin: AdminUser, @Param('id', ParseIntPipe) id: number, @Body() body: { status?: unknown; note?: unknown }): Promise<CaregiverProfile> {
    return this.profiles.decideChange(admin, id, body?.status, body?.note);
  }
}

import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { AdminUser, CaregiverCard } from '@pawpal/shared';
import type { Response } from 'express';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { ProfilesService } from './profiles.service';
import { TrustService, type InsuranceAdmin } from './trust.service';

/** The caregiver card owners see (O08). Any logged-in user; a caregiver previews their own. */
@Controller('caregivers')
@UseGuards(AuthGuard)
export class CaregiverCardController {
  constructor(
    private readonly trust: TrustService,
    private readonly profiles: ProfilesService,
  ) {}

  @Get(':id')
  card(@Param('id', ParseIntPipe) id: number): Promise<CaregiverCard> {
    return this.trust.card(id);
  }

  @Get(':id/photo')
  async photo(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.profiles.cardPhoto(id);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }
}

/** Admin Rules: the platform insurance switch and note (R17-3). */
@Controller('admin/insurance')
@UseGuards(AdminGuard)
@ForPage('rules')
export class InsuranceController {
  constructor(private readonly trust: TrustService) {}

  @Get()
  get(): Promise<InsuranceAdmin> {
    return this.trust.insuranceAdmin();
  }

  @Post()
  @HttpCode(200)
  set(@CurrentAdmin() admin: AdminUser, @Body() body: { on?: unknown; note?: unknown; reason?: unknown }): Promise<InsuranceAdmin> {
    return this.trust.setInsurance(admin, body);
  }
}

import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AdminUser, QueueCount } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { DashboardService } from './dashboard.service';

/** E14-1 A02 (round 57) */
@Controller('admin/dashboard')
@UseGuards(AdminGuard)
@ForPage('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('queues')
  queues(@CurrentAdmin() admin: AdminUser): Promise<QueueCount[]> {
    return this.dashboard.queues(admin);
  }
}

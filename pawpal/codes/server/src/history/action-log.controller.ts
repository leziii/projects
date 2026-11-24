import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { ActionLogPage } from '@pawpal/shared';
import { AdminGuard, ForPage } from '../admin/admin.guard';
import { ActionLogService } from './action-log.service';

/** E14-4 (round 60): read only; there is no route that changes or deletes a row (R60-3). */
@Controller('admin/actions')
@UseGuards(AdminGuard)
@ForPage('actions')
export class ActionLogController {
  constructor(private readonly log: ActionLogService) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Promise<ActionLogPage> {
    return this.log.list(query ?? {});
  }
}

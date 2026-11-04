import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import type { StatusChange } from '@pawpal/shared';
import { AdminGuard } from '../admin/admin.guard';
import { HistoryService } from './history.service';

/** Admin only (any page): history can show who did what. */
@Controller('history')
@UseGuards(AdminGuard)
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  @Get(':entity/:id')
  list(@Param('entity') entity: string, @Param('id', ParseIntPipe) id: number): Promise<StatusChange[]> {
    return this.history.list(entity, id);
  }
}

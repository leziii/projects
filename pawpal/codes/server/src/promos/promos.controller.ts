import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import type { AdminUser, Promo, StatusChange } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { PromosService } from './promos.service';

/** Admin "Promo codes" page (R23-6). */
@Controller('admin/promos')
@UseGuards(AdminGuard)
@ForPage('promos')
export class PromosController {
  constructor(private readonly promos: PromosService) {}

  @Get()
  list(): Promise<Promo[]> {
    return this.promos.list();
  }

  @Post()
  create(@CurrentAdmin() admin: AdminUser, @Body() body: Record<string, unknown>): Promise<Promo> {
    return this.promos.create(admin, body);
  }

  @Post(':id/active')
  @HttpCode(200)
  setActive(@CurrentAdmin() admin: AdminUser, @Param('id', ParseIntPipe) id: number, @Body() body: { active?: unknown; reason?: unknown }): Promise<Promo> {
    return this.promos.setActive(admin, id, body);
  }

  @Get(':id/history')
  history(@Param('id', ParseIntPipe) id: number): Promise<StatusChange[]> {
    return this.promos.historyOf(id);
  }
}

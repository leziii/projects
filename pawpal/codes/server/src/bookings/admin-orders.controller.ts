import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { AdminOrderAddress, AdminOrderDetail, AdminOrderPage, AdminUser } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { AdminOrdersService } from './admin-orders.service';

/** E14-2 A07 / A08 (round 58): read only; no edits here (R58-5). */
@Controller('admin/orders')
@UseGuards(AdminGuard)
@ForPage('orders')
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  list(@Query() query: Record<string, unknown>): Promise<AdminOrderPage> {
    return this.orders.list(query ?? {});
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number): Promise<AdminOrderDetail> {
    return this.orders.detail(id);
  }

  /** R58-4: shown on request, and recorded. */
  @Post(':id/address')
  @HttpCode(200)
  address(@CurrentAdmin() admin: AdminUser, @Param('id', ParseIntPipe) id: number): Promise<AdminOrderAddress> {
    return this.orders.address(admin, id);
  }
}

import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import type { AdminUser, MoneyDetail, MoneyItem } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { MoneyService } from './money.service';

/** E13-4 A13 / A14 (round 56). There is deliberately no way to mark an item paid (R56-4). */
@Controller('admin/money')
@UseGuards(AdminGuard)
@ForPage('money')
export class AdminMoneyController {
  constructor(private readonly money: MoneyService) {}

  @Get()
  list(): Promise<MoneyItem[]> {
    return this.money.list();
  }

  @Get(':id')
  detail(@Param('id') id: string): Promise<MoneyDetail> {
    return this.money.detail(id);
  }

  @Post(':id/send-again')
  @HttpCode(200)
  sendAgain(@CurrentAdmin() admin: AdminUser, @Param('id') id: string): Promise<MoneyDetail> {
    return this.money.sendAgain(admin, id);
  }

  @Post(':id/check')
  @HttpCode(200)
  check(@CurrentAdmin() admin: AdminUser, @Param('id') id: string): Promise<MoneyDetail> {
    return this.money.checkBank(admin, id);
  }
}

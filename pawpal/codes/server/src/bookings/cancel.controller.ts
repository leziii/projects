import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import type { CancelPreview, CancelResult, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { CancelService } from './cancel.service';

/** E10-1 O15 (round 42) */
@Controller('orders/:id/cancel')
@UseGuards(AuthGuard)
export class CancelController {
  constructor(private readonly cancels: CancelService) {}

  @Get()
  preview(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<CancelPreview> {
    return this.cancels.preview(user, id);
  }

  @Post()
  @HttpCode(200)
  cancel(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: { visits?: unknown; percents?: unknown }): Promise<CancelResult> {
    return this.cancels.cancel(user, id, body ?? {});
  }
}

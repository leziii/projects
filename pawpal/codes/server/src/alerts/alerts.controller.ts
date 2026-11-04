import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { AlertSent, AlertSettings, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AlertsService } from './alerts.service';

/** The logged-in user's alert settings: push on this browser, WhatsApp/SMS to the account phone. */
@Controller('alerts')
@UseGuards(AuthGuard)
export class AlertsController {
  constructor(private readonly alerts: AlertsService) {}

  @Get('settings')
  settings(@CurrentUser() user: User): Promise<AlertSettings> {
    return this.alerts.settings(user);
  }

  @Post('push')
  @HttpCode(200)
  subscribe(@CurrentUser() user: User, @Body() body: { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } }): Promise<AlertSettings> {
    return this.alerts.subscribe(user, body ?? {});
  }

  @Post('push/remove')
  @HttpCode(200)
  unsubscribe(@CurrentUser() user: User, @Body() body: { endpoint?: unknown }): Promise<AlertSettings> {
    return this.alerts.unsubscribe(user, body?.endpoint);
  }

  @Post('text')
  @HttpCode(200)
  text(@CurrentUser() user: User, @Body() body: { enabled?: unknown }): Promise<AlertSettings> {
    return this.alerts.setTextAlerts(user, body?.enabled);
  }

  @Post('test')
  @HttpCode(200)
  test(@CurrentUser() user: User): Promise<AlertSent> {
    return this.alerts.test(user);
  }
}

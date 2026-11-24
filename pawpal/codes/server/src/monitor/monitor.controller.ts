import { Body, Controller, Get, HttpCode, NotFoundException, Post, Query, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TEST_ERROR_MESSAGE, sentryOffText, type FunnelReport, type TestAlertResult, type TestErrorResult } from '@pawpal/shared';
import { AdminGuard, ForPage } from '../admin/admin.guard';
import { FunnelService } from './funnel.service';
import { MoneyAlertsService } from './money-alerts.service';
import { captureError, flushSentry, sentryEnabled } from './sentry';

/** R61-4: the app reports a funnel step. No login: people count before they sign in. */
@Controller('funnel')
export class FunnelController {
  constructor(private readonly funnel: FunnelService) {}

  @Post()
  @HttpCode(200)
  record(@Body() body: { step?: unknown; visitor?: unknown }): Promise<{ ok: true }> {
    return this.funnel.record(body ?? {});
  }
}

@Controller('admin/funnel')
@UseGuards(AdminGuard)
@ForPage('funnel')
export class AdminFunnelController {
  constructor(private readonly funnel: FunnelService) {}

  @Get()
  report(@Query('days') days?: string): Promise<FunnelReport> {
    return this.funnel.report(days);
  }
}

/** R61-5: Test tools. 404 in production or when DEV_TOOLS=off. */
@Controller('dev/monitor')
export class MonitorDevController {
  constructor(
    private readonly alerts: MoneyAlertsService,
    private readonly config: ConfigService,
  ) {}

  @Post('test-error')
  @HttpCode(200)
  async testError(): Promise<TestErrorResult> {
    this.enabled();
    const eventId = captureError(new Error(TEST_ERROR_MESSAGE));
    await flushSentry();
    const sentry = sentryEnabled();
    return { sentry, eventId, message: sentryOffText(sentry) };
  }

  @Post('test-alert')
  @HttpCode(200)
  testAlert(): Promise<TestAlertResult> {
    this.enabled();
    return this.alerts.test();
  }

  /** Runs the money alert check now instead of waiting a minute. */
  @Post('run-alerts')
  @HttpCode(200)
  async runAlerts(): Promise<{ sent: string[] }> {
    this.enabled();
    return { sent: await this.alerts.runDue() };
  }

  private enabled() {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
  }
}

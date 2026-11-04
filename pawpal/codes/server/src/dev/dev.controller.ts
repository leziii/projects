import { Body, Controller, Get, HttpCode, Inject, NotFoundException, Post, Query } from '@nestjs/common';
import { normalizeMyPhone } from '@pawpal/shared';
import { ConfigService } from '@nestjs/config';
import type { AdminCreated, AlertLogRow, AlertSent, Message, MessageCategory, MessageLink, Role, User } from '@pawpal/shared';
import { AdminAuthService } from '../admin/admin-auth.service';
import { AlertsService } from '../alerts/alerts.service';
import { TEST_PUSH_HOST, type PushPayload } from '../alerts/push';
import { MockWhatsappSender, WHATSAPP_SENDER, type WhatsappSender } from '../sms/sms';
import { totpCode } from '../admin/totp';
import { AuthService } from '../auth/auth.service';
import { MessagesService } from '../messages/messages.service';

/**
 * Development test tools, used from admin → Test tools until the real admin screens exist.
 * Answer 404 in production or when DEV_TOOLS=off.
 */
@Controller('dev')
export class DevController {
  constructor(
    private readonly auth: AuthService,
    private readonly messages: MessagesService,
    private readonly admins: AdminAuthService,
    private readonly alerts: AlertsService,
    @Inject(WHATSAPP_SENDER) private readonly whatsapp: WhatsappSender,
    private readonly config: ConfigService,
  ) {}

  /** Stand-in for caregiver review (E4-2): approve, suspend, ... a caregiver by phone number. */
  @Post('caregiver-status')
  caregiverStatus(@Body() body: { phone?: unknown; status?: unknown; reason?: unknown }): Promise<User> {
    this.enabled();
    return this.auth.setCaregiverStatus(body?.phone, body?.status, { type: 'admin', id: 'dev-tool' }, String(body?.reason ?? ''));
  }

  /** Sends a test message to a phone number (E2-3). A caregiver_application link always points to that user. */
  @Post('message')
  async message(@Body() body: Record<string, unknown>): Promise<Message> {
    this.enabled();
    const user = await this.auth.findByPhone(body?.phone);
    const type = body?.linkType;
    const link = type ? ({ type, id: type === 'caregiver_application' ? user.id : Number(body.linkId) } as MessageLink) : null;
    return this.messages.send(null, {
      userId: user.id,
      role: (body?.role || null) as Role | null,
      category: body?.category as MessageCategory,
      title: body?.title as string,
      body: body?.body as string,
      link,
    });
  }

  /** Creates an admin for automated tests (real admins come from `pnpm admin:create`). */
  @Post('admin')
  createAdmin(@Body() body: Record<string, unknown>): Promise<AdminCreated> {
    this.enabled();
    return this.admins.create(body ?? {});
  }

  /** The current authenticator code of an admin, for automated tests only. */
  @Get('admin-code')
  async adminCode(@Query('username') username: string, @Query('offset') offset?: string): Promise<{ code: string }> {
    this.enabled();
    const secret = await this.admins.secretFor(username);
    if (!secret) throw new NotFoundException({ code: 'ADMIN_NOT_FOUND', message: 'No such admin' });
    return { code: totpCode(secret, Date.now() + Number(offset ?? 0) * 1000) };
  }

  /** Stand-in for a real booking request (E6-1): alerts an approved caregiver now and 10 min before the deadline. */
  @Post('request-alert')
  @HttpCode(200)
  async requestAlert(@Body() body: Record<string, unknown>): Promise<AlertSent> {
    this.enabled();
    const user = await this.auth.findByPhone(body?.phone);
    return this.alerts.newRequest(user.id, {
      urgent: body?.urgent !== false,
      minutesLeft: Number(body?.minutesLeft ?? 30),
      firstVisit: String(body?.firstVisit ?? '10/28 09:00'),
      visits: Number(body?.visits ?? 1),
      area: String(body?.area ?? 'Mont Kiara'),
    });
  }

  /** Sends due reminders now instead of waiting for the 15-second check. */
  @Post('run-alerts')
  @HttpCode(200)
  async runAlerts(): Promise<{ sent: number }> {
    this.enabled();
    return { sent: await this.alerts.runDue() };
  }

  /** Every alert try for a phone number, newest first. */
  @Get('alerts')
  alertLog(@Query('phone') phone: string): Promise<AlertLogRow[]> {
    this.enabled();
    return this.alerts.logFor(normalizeMyPhone(phone ?? '') ?? '');
  }

  /** What a test push endpoint (https://push.test.pawpal/...) received. */
  @Get('push-inbox')
  async pushInbox(@Query('endpoint') endpoint: string): Promise<PushPayload[]> {
    this.enabled();
    if (!endpoint?.startsWith(TEST_PUSH_HOST)) throw new NotFoundException();
    return (await this.alerts.push()).testInbox.get(endpoint) ?? [];
  }

  /** Mock WhatsApp: make a number act as "not on WhatsApp", to see the SMS fallback. */
  @Post('whatsapp-unreachable')
  @HttpCode(200)
  whatsappUnreachable(@Body() body: { phone?: unknown; unreachable?: unknown }): { phone: string; unreachable: boolean } {
    this.enabled();
    const phone = normalizeMyPhone(String(body?.phone ?? ''));
    if (!phone || !(this.whatsapp instanceof MockWhatsappSender)) throw new NotFoundException();
    if (body?.unreachable === false) this.whatsapp.unreachable.delete(phone);
    else this.whatsapp.unreachable.add(phone);
    return { phone, unreachable: this.whatsapp.unreachable.has(phone) };
  }

  private enabled() {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
  }
}

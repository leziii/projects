import { Body, Controller, Get, HttpCode, NotFoundException, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BlockInput, BookedVisit, Schedule, ScheduleSettings, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { ScheduleService } from './schedule.service';

/** The approved caregiver's own schedule (S05), whichever role is active. */
@Controller('caregiver/schedule')
@UseGuards(AuthGuard)
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get()
  get(@CurrentUser() user: User): Promise<Schedule> {
    return this.schedule.get(user);
  }

  @Post('settings')
  @HttpCode(200)
  settings(@CurrentUser() user: User, @Body() body: Partial<ScheduleSettings>): Promise<Schedule> {
    return this.schedule.saveSettings(user, body ?? {});
  }

  @Post('blocks')
  @HttpCode(200)
  addBlock(@CurrentUser() user: User, @Body() body: BlockInput): Promise<Schedule> {
    return this.schedule.addBlock(user, body ?? {});
  }

  @Post('blocks/:id/delete')
  @HttpCode(200)
  removeBlock(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<Schedule> {
    return this.schedule.removeBlock(user, id);
  }
}

/** Test tool (R16-4): a booked visit on a caregiver's schedule, until orders exist in E6. Off in production. */
@Controller('dev')
export class ScheduleDevController {
  constructor(
    private readonly schedule: ScheduleService,
    private readonly config: ConfigService,
  ) {}

  @Post('test-visit')
  testVisit(@Body() body: { phone?: unknown; date?: unknown; start?: unknown; minutes?: unknown }): Promise<BookedVisit> {
    if (this.config.get('NODE_ENV') === 'production' || this.config.get('DEV_TOOLS') === 'off') throw new NotFoundException();
    return this.schedule.addTestVisit(body?.phone, body ?? {});
  }
}

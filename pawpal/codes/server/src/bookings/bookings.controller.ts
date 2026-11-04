import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import type { BookingDraft, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { BookingsService, type CaregiverList } from './bookings.service';

/** Booking setup (O06). Bookings belong to the account, like pets and addresses. */
@Controller('bookings/draft')
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(private readonly bookings: BookingsService) {}

  @Get()
  draft(@CurrentUser() user: User): Promise<BookingDraft> {
    return this.bookings.draft(user);
  }

  @Post()
  @HttpCode(200)
  save(@CurrentUser() user: User, @Body() body: Record<string, unknown>): Promise<BookingDraft> {
    return this.bookings.save(user, body);
  }

  /** O07: caregivers who fit this booking. */
  @Get('caregivers')
  caregivers(@CurrentUser() user: User): Promise<CaregiverList> {
    return this.bookings.caregivers(user);
  }

  /** O08 "Choose". */
  @Post('caregiver')
  @HttpCode(200)
  choose(@CurrentUser() user: User, @Body() body: { caregiverId?: unknown }): Promise<BookingDraft> {
    return this.bookings.choose(user, body?.caregiverId);
  }

  /** O09: how the caregiver gets in. */
  @Post('entry')
  @HttpCode(200)
  entry(@CurrentUser() user: User, @Body() body: Record<string, unknown>): Promise<BookingDraft> {
    return this.bookings.saveEntry(user, body);
  }

  /** "Start over". */
  @Post('clear')
  @HttpCode(200)
  clear(@CurrentUser() user: User): Promise<BookingDraft> {
    return this.bookings.clear(user);
  }
}

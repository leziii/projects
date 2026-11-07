import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import type { AdminReviewRow, AdminUser, CaregiverReviews, OrderReview, Review, User } from '@pawpal/shared';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { AuthGuard, CurrentUser, NeedsRole } from '../auth/auth.guard';
import { ReviewsService } from './reviews.service';

/** E9-3 (round 41): rate (O21), read (O08), reply (S07). */
@Controller()
@UseGuards(AuthGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /** R41-2 */
  @Post('orders/:id/review')
  @HttpCode(200)
  rate(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: { stars?: unknown; comment?: unknown }): Promise<OrderReview> {
    return this.reviews.rate(user, id, body ?? {});
  }

  /** R41-4 O08: any logged-in user. */
  @Get('caregivers/:id/reviews')
  forCaregiver(@Param('id', ParseIntPipe) id: number): Promise<CaregiverReviews> {
    return this.reviews.forCaregiver(id);
  }

  /** R41-5 */
  @Get('requests/:id/review')
  @NeedsRole('caregiver')
  ofOrder(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<{ review: Review | null }> {
    return this.reviews.ofCaregiverOrder(user, id);
  }

  @Post('requests/:id/review/reply')
  @HttpCode(200)
  @NeedsRole('caregiver')
  reply(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: { reply?: unknown }): Promise<{ review: Review | null }> {
    return this.reviews.reply(user, id, body?.reply);
  }
}

/** R41-6 */
@Controller('admin/reviews')
@UseGuards(AdminGuard)
@ForPage('reviews')
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get()
  list(): Promise<AdminReviewRow[]> {
    return this.reviews.adminList();
  }

  @Post(':id/hide')
  @HttpCode(200)
  hide(@CurrentAdmin() admin: AdminUser, @Param('id', ParseIntPipe) id: number, @Body() body: { reason?: unknown }): Promise<AdminReviewRow[]> {
    return this.reviews.hide(admin, id, body?.reason);
  }
}

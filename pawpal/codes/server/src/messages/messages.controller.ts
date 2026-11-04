import { Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import type { MessageList, OpenedMessage, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { MessagesService } from './messages.service';

/** The logged-in user's messages (both roles; each message says which role opens it). */
@Controller('messages')
@UseGuards(AuthGuard)
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Get()
  list(@CurrentUser() user: User, @Query('category') category?: string): Promise<MessageList> {
    return this.messages.list(user, category || undefined);
  }

  @Post('read-all')
  @HttpCode(200)
  readAll(@CurrentUser() user: User): Promise<{ read: number }> {
    return this.messages.readAll(user);
  }

  @Post(':id/open')
  @HttpCode(200)
  open(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<OpenedMessage> {
    return this.messages.open(user, id);
  }
}

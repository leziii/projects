import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import type { Address, AddressInput, User } from '@pawpal/shared';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { AddressesService } from './addresses.service';

/** The logged-in owner's addresses (O05). */
@Controller('addresses')
@UseGuards(AuthGuard)
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<Address[]> {
    return this.addresses.list(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: Partial<AddressInput>): Promise<Address> {
    return this.addresses.create(user, body ?? {});
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<Address> {
    return this.addresses.get(user, id);
  }

  @Post(':id')
  @HttpCode(200)
  update(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: Partial<AddressInput>): Promise<Address> {
    return this.addresses.update(user, id, body ?? {});
  }

  @Post(':id/default')
  @HttpCode(200)
  makeDefault(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<Address[]> {
    return this.addresses.makeDefault(user, id);
  }

  @Post(':id/delete')
  @HttpCode(200)
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<Address[]> {
    return this.addresses.remove(user, id);
  }
}

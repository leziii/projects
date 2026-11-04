import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res, UseGuards } from '@nestjs/common';
import type { AdminUser, Pet, PetCheckRow } from '@pawpal/shared';
import type { Response } from 'express';
import { AdminGuard, CurrentAdmin, ForPage } from '../admin/admin.guard';
import { PetsService, type PetCheckDetail } from './pets.service';

/** Admin pet check (A05/A06, E3-3). */
@Controller('admin/pets')
@UseGuards(AdminGuard)
@ForPage('pets')
export class PetCheckController {
  constructor(private readonly pets: PetsService) {}

  @Get()
  list(): Promise<PetCheckRow[]> {
    return this.pets.checkList();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number): Promise<PetCheckDetail> {
    return this.pets.checkDetail(id);
  }

  @Get(':id/vaccine-photo')
  async photo(@Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.pets.vaccinePhoto(null, id);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }

  @Post(':id/decision')
  @HttpCode(200)
  decide(@CurrentAdmin() admin: AdminUser, @Param('id', ParseIntPipe) id: number, @Body() body: { status?: unknown; note?: unknown }): Promise<Pet> {
    return this.pets.decide(admin, id, body?.status, body?.note);
  }
}

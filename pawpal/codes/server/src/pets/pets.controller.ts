import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PET_RULES, type Pet, type PetInput, type User } from '@pawpal/shared';
import type { Response } from 'express';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { imageType } from '../files/file-store';
import { PetsService } from './pets.service';

/** The logged-in user's pets (O02/O03). Pets belong to the account, whichever role is active. */
@Controller('pets')
@UseGuards(AuthGuard)
export class PetsController {
  constructor(private readonly pets: PetsService) {}

  @Get()
  list(@CurrentUser() user: User): Promise<Pet[]> {
    return this.pets.list(user);
  }

  @Post()
  create(@CurrentUser() user: User, @Body() body: Partial<PetInput>): Promise<Pet> {
    return this.pets.create(user, body ?? {});
  }

  @Get(':id')
  get(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<Pet> {
    return this.pets.get(user, id);
  }

  @Post(':id')
  @HttpCode(200)
  update(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Body() body: Partial<PetInput>): Promise<Pet> {
    return this.pets.update(user, id, body ?? {});
  }

  /** Multipart field "photo": a JPEG, PNG or WebP up to 5 MB. */
  @Post(':id/vaccine-photo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: PET_RULES.photoMaxBytes, files: 1 } }))
  upload(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @UploadedFile() file?: Express.Multer.File): Promise<Pet> {
    if (!file) throw new BadRequestException({ code: 'PHOTO_MISSING', message: 'Choose a photo' });
    const type = imageType(file.buffer);
    if (!type) throw new BadRequestException({ code: 'PHOTO_TYPE', message: 'Use a JPEG, PNG or WebP photo' });
    return this.pets.setVaccinePhoto(user, id, file.buffer, type);
  }

  /** Only the owner can see the card here; admins see it in the pet check. */
  @Get(':id/vaccine-photo')
  async photo(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.pets.vaccinePhoto(user, id);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }
}

import { BadRequestException, Body, Controller, Get, HttpCode, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { APPLICATION_RULES, type CaregiverProfile, type ProfileInput, type User } from '@pawpal/shared';
import type { Response } from 'express';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { imageType } from '../files/file-store';
import { ProfilesService } from './profiles.service';

/** The approved caregiver's own profile (S04), whichever role is active. */
@Controller('caregiver/profile')
@UseGuards(AuthGuard)
export class ProfileController {
  constructor(private readonly profiles: ProfilesService) {}

  @Get()
  get(@CurrentUser() user: User): Promise<CaregiverProfile> {
    return this.profiles.get(user);
  }

  @Post()
  @HttpCode(200)
  save(@CurrentUser() user: User, @Body() body: ProfileInput): Promise<CaregiverProfile> {
    return this.profiles.save(user, body ?? {});
  }

  /** Multipart field "photo" (JPEG, PNG or WebP, up to 5 MB); waits for review before it shows. */
  @Post('photo')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: APPLICATION_RULES.photoMaxBytes, files: 1 } }))
  upload(@CurrentUser() user: User, @UploadedFile() file?: Express.Multer.File): Promise<CaregiverProfile> {
    if (!file) throw new BadRequestException({ code: 'PHOTO_MISSING', message: 'Choose a photo' });
    const type = imageType(file.buffer);
    if (!type) throw new BadRequestException({ code: 'PHOTO_TYPE', message: 'Use a JPEG, PNG or WebP photo' });
    return this.profiles.setPhoto(user, file.buffer, type);
  }

  /** ?which=current (default) or pending. */
  @Get('photo')
  async photo(@CurrentUser() user: User, @Query('which') which: string, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.profiles.ownPhoto(user, which);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }
}

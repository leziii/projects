import { BadRequestException, Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { APPLICATION_RULES, CARE_GUIDE, type Application, type ApplicationInput, type User } from '@pawpal/shared';
import type { Response } from 'express';
import { AuthGuard, CurrentUser } from '../auth/auth.guard';
import { imageType } from '../files/file-store';
import { ApplicationsService } from './applications.service';

/** The logged-in user's caregiver application (S02). */
@Controller('caregiver')
@UseGuards(AuthGuard)
export class ApplicationsController {
  constructor(private readonly apps: ApplicationsService) {}

  @Get('guide')
  guide(): typeof CARE_GUIDE {
    return CARE_GUIDE;
  }

  @Get('application')
  get(@CurrentUser() user: User): Promise<Application> {
    return this.apps.get(user);
  }

  @Post('application')
  @HttpCode(200)
  save(@CurrentUser() user: User, @Body() body: ApplicationInput): Promise<Application> {
    return this.apps.save(user, body ?? {});
  }

  @Post('application/submit')
  @HttpCode(200)
  submit(@CurrentUser() user: User): Promise<Application> {
    return this.apps.submit(user);
  }

  /** Multipart field "photo" (JPEG, PNG or WebP, up to 5 MB); ?kind=ic_front|ic_back|selfie|certificate|good_conduct. */
  @Post('application/files')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('photo', { limits: { fileSize: APPLICATION_RULES.photoMaxBytes, files: 1 } }))
  upload(@CurrentUser() user: User, @Query('kind') kind: string, @UploadedFile() file?: Express.Multer.File): Promise<Application> {
    if (!file) throw new BadRequestException({ code: 'PHOTO_MISSING', message: 'Choose a photo' });
    const type = imageType(file.buffer);
    if (!type) throw new BadRequestException({ code: 'PHOTO_TYPE', message: 'Use a JPEG, PNG or WebP photo' });
    return this.apps.addFile(user, kind, file.buffer, type);
  }

  @Post('application/files/:id/delete')
  @HttpCode(200)
  remove(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number): Promise<Application> {
    return this.apps.removeFile(user, id);
  }

  @Get('application/files/:id')
  async file(@CurrentUser() user: User, @Param('id', ParseIntPipe) id: number, @Res() res: Response): Promise<void> {
    const { data, mime } = await this.apps.file(user, id);
    res.set({ 'content-type': mime, 'cache-control': 'private, no-store' }).send(data);
  }
}

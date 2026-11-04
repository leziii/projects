import { Controller, Get, Inject } from '@nestjs/common';
import type { SupportInfo } from '@pawpal/shared';
import { SUPPORT_INFO } from './support.module-token';

@Controller('support')
export class SupportController {
  constructor(@Inject(SUPPORT_INFO) private readonly info: SupportInfo) {}

  /** Open to guests too, so anyone can reach support. */
  @Get()
  get(): SupportInfo {
    return this.info;
  }
}

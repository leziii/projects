import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { supportInfo } from './support';
import { SupportController } from './support.controller';
import { SUPPORT_INFO } from './support.module-token';

@Module({
  controllers: [SupportController],
  providers: [{ provide: SUPPORT_INFO, useFactory: (c: ConfigService) => supportInfo(c.get('SUPPORT_WHATSAPP'), c.get('NODE_ENV')), inject: [ConfigService] }],
})
export class SupportModule {}

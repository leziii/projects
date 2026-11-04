import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MockSmsSender, MockWhatsappSender, SMS_SENDER, WHATSAPP_SENDER, type SmsSender, type WhatsappSender } from './sms';

/** SMS_PROVIDER=mock until a provider is chosen. The mock cannot run in production. */
function smsFactory(config: ConfigService): SmsSender {
  const name = config.get<string>('SMS_PROVIDER', 'mock');
  if (name !== 'mock') throw new Error(`SMS provider "${name}" is not built yet`);
  if (config.get('NODE_ENV') === 'production') throw new Error('The mock SMS sender cannot run in production');
  return new MockSmsSender();
}

/** WHATSAPP_PROVIDER=mock until a provider is chosen. The mock cannot run in production. */
function whatsappFactory(config: ConfigService): WhatsappSender {
  const name = config.get<string>('WHATSAPP_PROVIDER', 'mock');
  if (name !== 'mock') throw new Error(`WhatsApp provider "${name}" is not built yet`);
  if (config.get('NODE_ENV') === 'production') throw new Error('The mock WhatsApp sender cannot run in production');
  return new MockWhatsappSender();
}

@Global()
@Module({
  providers: [
    { provide: SMS_SENDER, useFactory: smsFactory, inject: [ConfigService] },
    { provide: WHATSAPP_SENDER, useFactory: whatsappFactory, inject: [ConfigService] },
  ],
  exports: [SMS_SENDER, WHATSAPP_SENDER],
})
export class SmsModule {}

import { Logger } from '@nestjs/common';

/** Sends text messages. Mock now; the real provider is chosen before the pilot (E15-5). */
export interface SmsSender {
  readonly name: string;
  send(phone: string, text: string): Promise<void>;
}

export const SMS_SENDER = Symbol('SMS_SENDER');

/** Development only: prints the message instead of sending it, and remembers the last one per phone. */
export class MockSmsSender implements SmsSender {
  readonly name = 'mock';
  private readonly last = new Map<string, string>();
  private readonly log = new Logger('MockSMS');

  send(phone: string, text: string): Promise<void> {
    this.last.set(phone, text);
    this.log.log(`To ${phone}: ${text}`);
    return Promise.resolve();
  }

  lastMessage(phone: string): string | undefined {
    return this.last.get(phone);
  }
}

/** Sends WhatsApp messages. Mock now; the real provider is chosen before the pilot (E15-5). */
export interface WhatsappSender {
  readonly name: string;
  /** Throws when the message cannot be delivered (e.g. the number has no WhatsApp). */
  send(phone: string, text: string): Promise<void>;
}

export const WHATSAPP_SENDER = Symbol('WHATSAPP_SENDER');

/** Development only: remembers messages instead of sending. Numbers in `unreachable` act as "no WhatsApp". */
export class MockWhatsappSender implements WhatsappSender {
  readonly name = 'mock';
  readonly unreachable = new Set<string>();
  private readonly last = new Map<string, string>();
  private readonly log = new Logger('MockWhatsApp');

  send(phone: string, text: string): Promise<void> {
    if (this.unreachable.has(phone)) return Promise.reject(new Error('This number is not on WhatsApp'));
    this.last.set(phone, text);
    this.log.log(`To ${phone}: ${text}`);
    return Promise.resolve();
  }

  lastMessage(phone: string): string | undefined {
    return this.last.get(phone);
  }
}

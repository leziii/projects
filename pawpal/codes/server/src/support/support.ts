import { SUPPORT_PLACEHOLDER, normalizeWhatsapp, type SupportInfo } from '@pawpal/shared';

/**
 * Reads SUPPORT_WHATSAPP. A wrong value stops the server at start-up.
 * Unset: the placeholder outside production, none in production.
 */
export function supportInfo(value: string | undefined, nodeEnv: string | undefined): SupportInfo {
  if (value?.trim()) {
    const whatsapp = normalizeWhatsapp(value);
    if (!whatsapp) throw new Error(`SUPPORT_WHATSAPP "${value}" is not a valid WhatsApp number`);
    return { whatsapp, placeholder: false };
  }
  return nodeEnv === 'production' ? { whatsapp: null, placeholder: false } : { whatsapp: SUPPORT_PLACEHOLDER, placeholder: true };
}

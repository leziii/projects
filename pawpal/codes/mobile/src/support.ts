import { whatsappLink, type SupportInfo } from '@pawpal/shared';

/** Where the help button goes: the WhatsApp link, or why it cannot open. */
export function helpTarget(info: SupportInfo | null, orderNo?: string): { link: string } | { error: string } {
  if (!info) return { error: 'Cannot reach PawPal. Check your connection and try again.' };
  if (!info.whatsapp) return { error: 'Support chat is not set up yet.' };
  return { link: whatsappLink(info.whatsapp, orderNo) };
}

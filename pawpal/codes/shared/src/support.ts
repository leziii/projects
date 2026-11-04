/**
 * Support contact (E2-6): a WhatsApp button that opens a chat with PawPal support.
 * The prefilled text holds an order number at most, never a name, phone or address.
 */

/** Placeholder used outside production until KF gives the real number. */
export const SUPPORT_PLACEHOLDER = '60123456789';

export interface SupportInfo {
  /** Digits only, with country code (e.g. 60123456789); null when not set. */
  whatsapp: string | null;
  /** True while the placeholder number is in use. */
  placeholder: boolean;
}

/** Digits only with a country code, 10–15 digits; a Malaysian 01x number gets 60 in front. Null if invalid. */
export function normalizeWhatsapp(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s+\-()]/g, '');
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('01')) digits = `6${digits}`;
  return /^[1-9]\d{9,14}$/.test(digits) ? digits : null;
}

/** Order numbers look like P20261028001. */
export const ORDER_NO = /^P\d{11,}$/;

/** The prefilled chat text. Anything that is not an order number is left out. */
export function helpText(orderNo?: string): string {
  return orderNo && ORDER_NO.test(orderNo) ? `Hi PawPal, I need help with order #${orderNo}.` : 'Hi PawPal, I need help.';
}

/** wa.me link that opens WhatsApp with the text filled in. */
export function whatsappLink(number: string, orderNo?: string): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(helpText(orderNo))}`;
}

/** "+60 12-345 6789" style for showing the number. */
export function formatWhatsapp(number: string): string {
  const m = /^60(1\d)(\d{3,4})(\d{4})$/.exec(number);
  return m ? `+60 ${m[1]}-${m[2]} ${m[3]}` : `+${number}`;
}

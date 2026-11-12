/**
 * R41-8 (KF, 6 Nov): the TEST payment page asks for card details when Card is chosen, so the flow
 * feels real. The details are only checked in the browser and then thrown away: they are never sent
 * to the PawPal server. The real gateway's own page will collect cards (E15).
 */
export interface TestCardInput {
  number: string;
  name: string;
  /** "MM/YY" */
  expiry: string;
  cvv: string;
}

const digits = (s: string) => s.replace(/\D/g, '');

/** "4111111111111111" → "4111 1111 1111 1111" (max 16 digits). */
export const cardNumberText = (s: string) => digits(s).slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ');

/** "1229" → "12/29"; typing keeps the slash in place. */
export function expiryText(s: string): string {
  const d = digits(s).slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

/** Luhn check, as banks use for card numbers. */
export function luhnOk(number: string): boolean {
  const d = digits(number);
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return d.length > 0 && sum % 10 === 0;
}

/** Everything still to fill in, in form order; empty when the card can be used. `today` is a KL date "YYYY-MM-DD". */
export function testCardProblems(c: TestCardInput, today: string): string[] {
  const out: string[] = [];
  const n = digits(c.number);
  if (n.length !== 16) out.push('Card number: 16 digits');
  else if (!luhnOk(n)) out.push('Card number: check the digits');
  if (c.name.trim().length < 2) out.push('Name on card');
  const m = /^(\d{2})\/(\d{2})$/.exec(c.expiry.trim());
  const month = m ? Number(m[1]) : 0;
  if (!m || month < 1 || month > 12) out.push('Expiry: MM/YY');
  else if (`20${m[2]}-${m[1]}` < today.slice(0, 7)) out.push('Expiry: this card has expired');
  if (!/^\d{3}$/.test(c.cvv)) out.push('CVV: 3 digits');
  return out;
}

import { describe, expect, it } from 'vitest';
import { containsAddress } from './messages';
import { formatWhatsapp, helpText, normalizeWhatsapp, whatsappLink } from './support';

describe('E2-6 support WhatsApp', () => {
  it('normalizes numbers to digits with country code', () => {
    expect(normalizeWhatsapp('+60 12-345 6789')).toBe('60123456789');
    expect(normalizeWhatsapp('012-345 6789')).toBe('60123456789');
    expect(normalizeWhatsapp('6531234567')).toBe('6531234567');
  });

  it('rejects bad numbers', () => {
    for (const bad of [undefined, '', 'abc', '12345', '0123456789012345678', '60-12x']) expect(normalizeWhatsapp(bad)).toBeNull();
  });

  it('fills in the order number only when it looks like one', () => {
    expect(helpText()).toBe('Hi PawPal, I need help.');
    expect(helpText('P20261028001')).toBe('Hi PawPal, I need help with order #P20261028001.');
    // A busy day passes 999 orders: the counter just grows.
    expect(helpText('P202610281006')).toBe('Hi PawPal, I need help with order #P202610281006.');
    expect(helpText('Jalan Ampang 12')).toBe('Hi PawPal, I need help.');
  });

  it('builds a wa.me link with encoded text and no address', () => {
    const link = whatsappLink('60123456789', 'P20261028001');
    expect(link).toBe('https://wa.me/60123456789?text=Hi%20PawPal%2C%20I%20need%20help%20with%20order%20%23P20261028001.');
    expect(containsAddress(decodeURIComponent(link.split('text=')[1]))).toBe(false);
  });

  it('formats the number for display', () => {
    expect(formatWhatsapp('60123456789')).toBe('+60 12-345 6789');
    expect(formatWhatsapp('601123456789')).toBe('+60 11-2345 6789');
    expect(formatWhatsapp('6531234567')).toBe('+6531234567');
  });
});

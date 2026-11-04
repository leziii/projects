import { describe, expect, it } from 'vitest';
import { helpTarget } from './support';

describe('E2-6 help button', () => {
  const info = { whatsapp: '60123456789', placeholder: false };

  it('opens WhatsApp with the general help text', () => {
    expect(helpTarget(info)).toEqual({ link: 'https://wa.me/60123456789?text=Hi%20PawPal%2C%20I%20need%20help.' });
  });

  it('adds the order number on order pages', () => {
    expect(helpTarget(info, 'P20261028001')).toEqual({ link: expect.stringContaining('order%20%23P20261028001') });
  });

  it('explains when it cannot open', () => {
    expect(helpTarget(null)).toEqual({ error: expect.stringContaining('Cannot reach PawPal') });
    expect(helpTarget({ whatsapp: null, placeholder: false })).toEqual({ error: 'Support chat is not set up yet.' });
  });
});

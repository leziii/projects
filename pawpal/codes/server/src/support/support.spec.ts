import { describe, expect, it } from 'vitest';
import { supportInfo } from './support';

describe('E2-6 support number config', () => {
  it('uses SUPPORT_WHATSAPP when set', () => {
    expect(supportInfo('+60 19-876 5432', 'production')).toEqual({ whatsapp: '60198765432', placeholder: false });
  });

  it('falls back to the placeholder outside production only', () => {
    expect(supportInfo(undefined, 'development')).toEqual({ whatsapp: '60123456789', placeholder: true });
    expect(supportInfo('  ', 'production')).toEqual({ whatsapp: null, placeholder: false });
  });

  it('refuses a wrong number at start-up', () => {
    expect(() => supportInfo('call us', 'development')).toThrow('not a valid WhatsApp number');
  });
});

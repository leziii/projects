import { describe, expect, it } from 'vitest';
import { reminderAlertText, reminderAt, requestAlertText, textAlert } from './alerts';

describe('E2-5 alerts', () => {
  it('describes a request without an address', () => {
    expect(requestAlertText({ urgent: true, minutesLeft: 24, firstVisit: '10/28 09:00', visits: 3, area: 'Mont Kiara' })).toEqual({
      title: 'Urgent booking request · 24 min left',
      body: 'First visit 10/28 09:00, 3 visits, Mont Kiara. Open PawPal to accept.',
    });
    expect(requestAlertText({ urgent: false, minutesLeft: 130, firstVisit: '10/30 10:00', visits: 1, area: 'Bangsar' }).title).toBe('New booking request · 2 h 10 min left');
    expect(() => requestAlertText({ urgent: true, minutesLeft: 24, firstVisit: '10/28', visits: 1, area: 'Jalan Ampang' })).toThrow('must not contain an address');
    expect(() => requestAlertText({ urgent: true, minutesLeft: 0, firstVisit: '10/28', visits: 1, area: 'Bangsar' })).toThrow('minutesLeft');
  });

  it('reminds 10 minutes before the deadline, if there is time', () => {
    const now = new Date('2026-10-27T10:00:00+08:00');
    expect(reminderAt(new Date('2026-10-27T10:30:00+08:00'), now)?.toISOString()).toBe(new Date('2026-10-27T10:20:00+08:00').toISOString());
    expect(reminderAt(new Date('2026-10-27T10:10:00+08:00'), now)).toBeNull();
    expect(reminderAlertText()).toEqual({ title: 'Request closes in 10 min', body: 'A booking request is still waiting for you. Open PawPal to accept.' });
  });

  it('one-line text for WhatsApp/SMS', () => {
    expect(textAlert({ title: 'Request closes in 10 min', body: 'Open PawPal.' })).toBe('PawPal: Request closes in 10 min. Open PawPal.');
  });
});

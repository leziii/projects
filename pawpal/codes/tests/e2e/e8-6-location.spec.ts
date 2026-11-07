import { expect, test } from '@playwright/test';
import { readyToPay } from './booking-helpers';
import { ADMIN, API, MOBILE, adminSession, mobileSession } from './helpers';

const HOME = { latitude: 3.1319, longitude: 101.6841 };
const FAR = { latitude: 3.1419, longitude: 101.6841 }; // ~1.1 km away

// E8-6: the owner sets the home position on O05; the caregiver's location at "I've arrived" is checked; admin sees the far one.
test('home position, location at arrival, admin flag, owner sees only "Location recorded"', async ({ browser, request }) => {
  const r = await readyToPay(request, browser, true);
  const [address] = await (await request.get(`${API}/addresses`, { headers: r.headers })).json();

  // R38-2: the owner, at home, taps "Use my current location".
  const ownerCtx = await browser.newContext({ geolocation: HOME, permissions: ['geolocation'] });
  const owner = await ownerCtx.newPage();
  await mobileSession(owner, r.token, `/pages/addresses/edit?id=${address.id}`);
  await expect(owner.locator('[data-test=home-state]')).toHaveText('Not set. Tap the button while you are at this address.');
  await owner.locator('[data-test=use-location]').click();
  await expect(owner.locator('[data-test=home-state]')).toContainText('📍');
  // KF hand test: the typed address shows beside the pin.
  await expect(owner.locator('[data-test=home-address]')).toHaveText(`${address.unit}, ${address.street}, ${address.postcode} ${address.area}`);
  // KF hand test: the owner can check the point on the map.
  await ownerCtx.route('https://www.google.com/**', (route) => route.fulfill({ body: 'map' }));
  const [map] = await Promise.all([ownerCtx.waitForEvent('page'), owner.locator('[data-test=view-map]').click()]);
  await map.waitForURL(/google\.com\/maps/);
  expect(map.url()).toBe(`https://www.google.com/maps?q=${HOME.latitude},${HOME.longitude}`);
  await map.close();
  await owner.locator('[data-test=save]').click();
  await expect.poll(async () => (await (await request.get(`${API}/addresses/${address.id}`, { headers: r.headers })).json()).home).toEqual({ lat: HOME.latitude, lng: HOME.longitude });

  expect((await request.post(`${API}/auth/role`, { headers: r.caregiver.headers, data: { role: 'caregiver' } })).ok()).toBe(true);
  const { order, paymentId } = await (await request.post(`${API}/bookings/draft/pay`, { headers: r.headers, data: { healthConfirmed: true, method: 'tng' } })).json();
  expect((await request.post(`${API}/mock-gateway/payments/${paymentId}/outcome`, { data: { outcome: 'success' } })).ok()).toBe(true);
  expect((await request.post(`${API}/requests/${order.id}/accept`, { headers: r.caregiver.headers })).ok()).toBe(true);
  expect((await request.post(`${API}/dev/visit-soon`, { data: { number: order.number, index: 0 } })).ok()).toBe(true);

  // R38-1, R38-6: the caregiver taps "I've arrived" 1.1 km away; the notice says when the location is saved.
  const cgCtx = await browser.newContext({ geolocation: FAR, permissions: ['geolocation'] });
  const cg = await cgCtx.newPage();
  await mobileSession(cg, r.caregiver.token, `/pages/caregiver/visit?id=${order.id}&i=0`);
  await expect(cg.locator('[data-test=location-notice]')).toHaveText('📍 Your location is saved only now and when you send the report.');
  await cg.locator('[data-test=arrive]').click();
  await expect(cg.locator('[data-test=visit-status]')).toHaveText('Arrived');
  await cgCtx.close();

  // R38-4: admin sees it, with the distance.
  const admin = await browser.newPage();
  await adminSession(admin, request);
  await admin.setViewportSize({ width: 1280, height: 900 });
  await admin.goto(`${ADMIN}/locations`);
  const row = admin.locator('[data-test=flags] .el-table__row', { hasText: order.number });
  await expect(row).toContainText("I've arrived");
  await expect(row).toContainText(/Far from the address · 1\.1 km/);
  await admin.close();

  // R38-5: the owner sees only that a location was recorded.
  await owner.goto(`${MOBILE}/pages/orders/visit?id=${order.id}&i=0`);
  await expect(owner.locator('[data-test=location-recorded]')).toHaveText('📍 Location recorded');
  await expect(owner.locator('body')).not.toContainText('km');
  await ownerCtx.close();
});

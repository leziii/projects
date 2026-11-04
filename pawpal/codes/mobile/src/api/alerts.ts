import type { AlertSent, AlertSettings } from '@pawpal/shared';
import { keyBytes } from '../alerts';
import { api } from './client';

export const alertSettings = () => api<AlertSettings>('/alerts/settings');
export const setTextAlerts = (enabled: boolean) => api<AlertSettings>('/alerts/text', { enabled });
export const sendTestAlert = () => api<AlertSent>('/alerts/test', {});

/** This browser's push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Asks permission, subscribes this browser and tells the server. */
export async function turnOnPush(vapidPublicKey: string): Promise<AlertSettings> {
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('Notifications were not allowed');
  await navigator.serviceWorker.register('/sw.js');
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) }));
  return api<AlertSettings>('/alerts/push', sub.toJSON());
}

export async function turnOffPush(): Promise<AlertSettings> {
  const sub = await currentSubscription();
  const settings = await api<AlertSettings>('/alerts/push/remove', { endpoint: sub?.endpoint ?? '' });
  await sub?.unsubscribe();
  return settings;
}

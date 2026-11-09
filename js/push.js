// Turning notifications on/off on this phone.
import { CONFIG } from './config.js';
import * as db from './db.js';

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on'
export async function pushState() {
  if (isIOS() && !standalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

function keyBytes(b64) {
  const s = atob(b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

export async function enablePush() {
  if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications weren’t allowed. You can change this in your phone’s settings.');
  const reg = await navigator.serviceWorker.register('sw.js');
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(CONFIG.vapidPublicKey) });
  const j = sub.toJSON();
  await db.backend().upsertBy('push_subscriptions', { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_id: db.S.me.id }, 'endpoint');
}

export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await db.backend().removeWhere?.('push_subscriptions', 'endpoint', sub.endpoint).catch(() => {});
  await sub.unsubscribe();
}

/*
 * Firebase Cloud Messaging service worker (background notifications).
 *
 * - Contains NO credentials. The PUBLIC Firebase web config is passed in the
 *   registration URL query string by the app (see frontend/src/services/push.ts).
 * - Payloads are data-only and minimal by server design: type, ids, a generic
 *   title/body, and the in-app URL. No message content or secure content.
 * - Clicking a notification opens/focuses the app at /chat/{id}; the app then
 *   loads the message through the normal authenticated, authorized API.
 *
 * Keep FIREBASE_VERSION in sync with the "firebase" version in frontend/package.json.
 */
const FIREBASE_VERSION = '12.19.0';

importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app-compat.js`);
importScripts(`https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-messaging-compat.js`);

const params = new URL(self.location.href).searchParams;
const config = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

/** Only same-origin chat URLs are ever opened from a notification. */
function safeChatPath(value) {
  return typeof value === 'string' && /^\/chat\/\d{1,18}$/.test(value) ? value : '/chat';
}

/** Defensive: never display more than a short plain string. */
function clean(value, fallback) {
  if (typeof value !== 'string' || value.trim() === '') return fallback;
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 120);
}

async function isViewing(path) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  return windows.some((client) => {
    try {
      return client.focused && client.visibilityState === 'visible' && new URL(client.url).pathname === path;
    } catch (e) {
      return false;
    }
  });
}

if (config.apiKey && config.projectId && config.messagingSenderId && config.appId) {
  firebase.initializeApp(config);
  const messaging = firebase.messaging();

  messaging.onBackgroundMessage(async (payload) => {
    const data = payload.data || {};
    if (data.type !== 'new_message') return;

    const url = safeChatPath(data.url);
    // Don't notify about the conversation the user is actively looking at.
    if (await isViewing(url)) return;

    await self.registration.showNotification(clean(data.title, 'New message'), {
      body: clean(data.body, 'You have a new message.'),
      tag: clean(data.tag, 'chat'),
      renotify: true,
      data: { url },
    });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const path = safeChatPath(event.notification.data && event.notification.data.url);
  const target = new URL(path, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windows) {
        if (new URL(client.url).origin === self.location.origin && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            return client.navigate(target);
          }
          return undefined;
        }
      }
      return self.clients.openWindow(target);
    })(),
  );
});

// Activate updated workers promptly.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

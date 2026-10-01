import { initializeApp, type FirebaseApp } from 'firebase/app'
import { deleteToken, getMessaging, getToken, isSupported, onMessage, type Messaging } from 'firebase/messaging'
import { ref } from 'vue'
import { chatApi } from './api'
import type { ClientConfig } from '@/types'

/**
 * Browser notifications.
 *
 *  - "push" mode: Firebase Cloud Messaging is configured server-side, so
 *    notifications arrive even when the app is closed/backgrounded (via
 *    /firebase-messaging-sw.js).
 *  - "local" mode: FCM not configured; notifications are shown only while
 *    the app is open (from realtime / polling events).
 *
 * Permission is NEVER requested automatically: only from enable(), which is
 * called from an explicit user click. After a denial we never ask again.
 *
 * Storage: only a per-user boolean "enabled on this device" flag is kept in
 * localStorage. No tokens, credentials or message data are stored by us.
 */
export type NotificationState = 'unsupported' | 'denied' | 'enabled' | 'disabled' | 'working'
export type NotificationMode = 'push' | 'local' | 'none'

export const notificationState = ref<NotificationState>('disabled')
export const notificationMode = ref<NotificationMode>('none')

interface ForegroundPush {
  conversation_id?: string
  title?: string
  body?: string
  url?: string
  tag?: string
}

let firebaseConfig: NonNullable<ClientConfig['push']['firebase']> | null = null
let app: FirebaseApp | null = null
let messaging: Messaging | null = null
let registration: ServiceWorkerRegistration | null = null
let userId: number | null = null
let foregroundHandler: ((data: ForegroundPush) => void) | null = null
let unsubscribeForeground: (() => void) | null = null

const flagKey = () => `notifications.enabled.${userId}`

function readFlag(): boolean {
  try {
    return localStorage.getItem(flagKey()) === '1'
  } catch {
    return false
  }
}

function writeFlag(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(flagKey(), '1')
    else localStorage.removeItem(flagKey())
  } catch {
    /* storage unavailable: preference simply isn't remembered */
  }
}

function deviceInfo(): { browser: string; device_name: string } {
  const ua = navigator.userAgent
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser'
  const device_name = /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'Device'
  return { browser, device_name }
}

async function ensureMessaging(): Promise<Messaging | null> {
  if (!firebaseConfig) return null
  if (messaging && registration) return messaging

  // Public Firebase web config is passed to the service worker via its URL
  // (these values are designed to be public; no server credentials here).
  const { vapidKey: _vapid, ...publicConfig } = firebaseConfig
  const swUrl = `/firebase-messaging-sw.js?${new URLSearchParams(publicConfig as Record<string, string>)}`
  registration = await navigator.serviceWorker.register(swUrl, { scope: '/' })

  app ??= initializeApp(firebaseConfig, 'chat')
  messaging = getMessaging(app)

  unsubscribeForeground?.()
  unsubscribeForeground = onMessage(messaging, (payload) => foregroundHandler?.((payload.data ?? {}) as ForegroundPush))

  return messaging
}

async function currentToken(): Promise<string | null> {
  const m = await ensureMessaging()
  if (!m || !registration || !firebaseConfig) return null
  return getToken(m, { vapidKey: firebaseConfig.vapidKey, serviceWorkerRegistration: registration })
}

async function registerWithServer(): Promise<void> {
  const token = await currentToken()
  if (!token) throw new Error('No push token')
  await chatApi.registerPushToken({ token, platform: 'web', ...deviceInfo() })
}

/** Called after login / page load. Re-syncs silently if previously enabled. */
export async function initNotifications(
  config: ClientConfig,
  currentUserId: number,
  onForeground: (data: ForegroundPush) => void,
): Promise<void> {
  userId = currentUserId
  foregroundHandler = onForeground
  firebaseConfig = config.push.enabled ? config.push.firebase : null

  if (!('Notification' in window)) {
    notificationState.value = 'unsupported'
    notificationMode.value = 'none'
    return
  }

  const pushCapable = !!firebaseConfig && 'serviceWorker' in navigator && 'PushManager' in window && (await isSupported().catch(() => false))
  notificationMode.value = pushCapable ? 'push' : 'local'
  if (!pushCapable) firebaseConfig = null

  if (Notification.permission === 'denied') {
    notificationState.value = 'denied'
    return
  }

  if (readFlag() && Notification.permission === 'granted') {
    notificationState.value = 'enabled'
    if (notificationMode.value === 'push') {
      // Token may have rotated since last visit; registration is idempotent.
      registerWithServer().catch(() => (notificationState.value = 'disabled'))
    }
  } else {
    notificationState.value = 'disabled'
  }
}

/** Must be called from a user gesture (button click). */
export async function enableNotifications(): Promise<void> {
  if (notificationState.value === 'unsupported' || notificationState.value === 'denied') return

  notificationState.value = 'working'
  try {
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permission !== 'granted') {
      notificationState.value = permission === 'denied' ? 'denied' : 'disabled'
      return
    }
    if (notificationMode.value === 'push') {
      await registerWithServer()
    }
    writeFlag(true)
    notificationState.value = 'enabled'
  } catch (error) {
    notificationState.value = 'disabled'
    throw error
  }
}

/** Removes this device's token from the server and from Firebase. */
export async function disableNotifications(): Promise<void> {
  notificationState.value = 'working'
  try {
    await removeDeviceToken()
  } finally {
    writeFlag(false)
    notificationState.value = Notification.permission === 'denied' ? 'denied' : 'disabled'
  }
}

/**
 * Logout: returns the token so the logout request can remove it server-side,
 * and invalidates it at Firebase so the device stops receiving pushes even if
 * the server call fails. The user's "enabled" preference is kept for next login.
 */
export async function teardownForLogout(): Promise<string | null> {
  let token: string | null = null
  if (notificationMode.value === 'push' && notificationState.value === 'enabled') {
    try {
      token = await currentToken()
      if (messaging) await deleteToken(messaging)
    } catch {
      /* best effort */
    }
  }
  unsubscribeForeground?.()
  unsubscribeForeground = null
  foregroundHandler = null
  userId = null
  return token
}

async function removeDeviceToken(): Promise<void> {
  if (notificationMode.value !== 'push') return
  const token = await currentToken().catch(() => null)
  if (token) {
    await chatApi.removePushToken(token).catch(() => undefined)
    if (messaging) await deleteToken(messaging).catch(() => undefined)
  }
}

/** Show a notification while the app is open (tab visible but another chat, or local mode). */
export async function showLocalNotification(title: string, body: string, url: string, tag: string): Promise<void> {
  if (notificationState.value !== 'enabled' || Notification.permission !== 'granted') return

  const options: NotificationOptions = { body, tag, data: { url }, icon: undefined }
  const reg = registration ?? (await navigator.serviceWorker?.getRegistration('/').catch(() => undefined))
  if (reg) {
    await reg.showNotification(title, options)
  } else {
    const n = new Notification(title, options)
    n.onclick = () => {
      window.focus()
      window.location.assign(url)
    }
  }
}

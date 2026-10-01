import { reactive } from 'vue'
import { authApi, chatApi } from '@/services/api'
import { ensureCsrfCookie } from '@/services/http'
import { disconnectRealtime } from '@/services/realtime'
import { teardownForLogout } from '@/services/push'
import type { ClientConfig, CurrentUser } from '@/types'

/**
 * Authentication state lives in memory only. The session itself is an
 * HTTP-only cookie that JavaScript cannot read.
 */
export const session = reactive({
  ready: false,
  user: null as CurrentUser | null,
  config: null as ClientConfig | null,
  appName: 'Internal Chat',
  registrationMode: 'approval' as string,
})

export async function bootstrapSession(): Promise<void> {
  try {
    await ensureCsrfCookie()
    const publicConfig = await authApi.publicConfig()
    session.appName = publicConfig.app_name
    session.registrationMode = publicConfig.registration_mode
    document.title = publicConfig.app_name
  } catch {
    /* offline: keep defaults */
  }

  try {
    session.user = await authApi.me()
    session.config = await chatApi.config()
  } catch {
    session.user = null
  }
  session.ready = true
}

export async function login(email: string, password: string): Promise<void> {
  await ensureCsrfCookie()
  session.user = await authApi.login(email, password)
  session.config = await chatApi.config()
}

export function setUser(user: CurrentUser): void {
  session.user = user
}

export async function loadConfig(): Promise<void> {
  session.config = await chatApi.config()
}

export async function logout(): Promise<void> {
  const pushToken = await teardownForLogout()
  try {
    await authApi.logout(pushToken)
  } finally {
    clearSession()
    await ensureCsrfCookie(true).catch(() => undefined)
  }
}

/** Drop all in-memory state (logout, expiry, suspension). */
export function clearSession(): void {
  disconnectRealtime()
  session.user = null
  session.config = null
}

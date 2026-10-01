import axios, { AxiosError, type AxiosRequestConfig } from 'axios'

/**
 * API origin. Empty (default) = same origin as the SPA. For a split deployment
 * (SPA on Vercel, API on Cloudways) set VITE_API_URL=https://api.example.com
 * at build time; both hosts must share a parent domain so the session cookie
 * (SESSION_DOMAIN=.example.com) is same-site.
 */
export const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')

/** Absolute URL for a server-relative API path (e.g. attachment downloads). */
export function apiUrl(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${API_BASE}${path.startsWith('/') ? '' : '/'}${path}`
}

/**
 * HTTP client. Authentication is an HTTP-only session cookie set by Laravel;
 * nothing auth-related is ever stored in JS-accessible storage.
 * CSRF: Laravel sets the XSRF-TOKEN cookie, axios echoes it as X-XSRF-TOKEN
 * (withXSRFToken also sends it to the API subdomain in split deployments).
 */
export const http = axios.create({
  baseURL: API_BASE || '/',
  withCredentials: true,
  withXSRFToken: true,
  xsrfCookieName: 'XSRF-TOKEN',
  xsrfHeaderName: 'X-XSRF-TOKEN',
  headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  timeout: 30_000,
})

let csrfPromise: Promise<void> | null = null

export function ensureCsrfCookie(force = false): Promise<void> {
  if (force || !csrfPromise) {
    csrfPromise = http.get('/sanctum/csrf-cookie').then(() => undefined)
    csrfPromise.catch(() => (csrfPromise = null))
  }
  return csrfPromise
}

type UnauthorizedHandler = (reason: 'unauthenticated' | 'expired' | 'inactive') => void
let onUnauthorized: UnauthorizedHandler = () => {}

export function setUnauthorizedHandler(handler: UnauthorizedHandler): void {
  onUnauthorized = handler
}

http.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message?: string }>) => {
    const status = error.response?.status
    const config = error.config as (AxiosRequestConfig & { _csrfRetried?: boolean; _skipAuthRedirect?: boolean }) | undefined

    // Stale CSRF token (e.g. after login/logout regenerated the session): refresh once.
    if (status === 419 && config && !config._csrfRetried) {
      config._csrfRetried = true
      await ensureCsrfCookie(true)
      return http.request(config)
    }

    if (!config?._skipAuthRedirect) {
      if (status === 401) {
        const message = error.response?.data?.message ?? ''
        onUnauthorized(message.includes('expired') ? 'expired' : 'unauthenticated')
      } else if (status === 403 && error.response?.data?.message === 'Your account is not active.') {
        onUnauthorized('inactive')
      }
    }

    return Promise.reject(error)
  },
)

export interface FieldErrors {
  [field: string]: string[]
}

/** Safe, user-presentable error extraction. */
export function errorMessage(error: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) return 'Network error. Check your connection.'
    if (error.response.status === 429) return 'Too many requests. Please wait a moment.'
    const data = error.response.data as { message?: string; errors?: FieldErrors }
    const firstFieldError = data?.errors ? Object.values(data.errors)[0]?.[0] : undefined
    return firstFieldError ?? data?.message ?? fallback
  }
  return fallback
}

export function fieldErrors(error: unknown): FieldErrors {
  if (axios.isAxiosError(error)) {
    return ((error.response?.data as { errors?: FieldErrors })?.errors ?? {}) as FieldErrors
  }
  return {}
}

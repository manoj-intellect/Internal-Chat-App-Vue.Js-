import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { session } from '@/stores/session'

const routes: RouteRecordRaw[] = [
  { path: '/', redirect: '/chat' },
  { path: '/login', component: () => import('@/pages/LoginPage.vue'), meta: { guest: true } },
  { path: '/register', component: () => import('@/pages/RegisterPage.vue'), meta: { guest: true } },
  { path: '/forgot-password', component: () => import('@/pages/ForgotPasswordPage.vue'), meta: { guest: true } },
  { path: '/reset-password', component: () => import('@/pages/ResetPasswordPage.vue'), meta: { public: true } },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    meta: { auth: true },
    children: [
      { path: 'chat/:id(\\d+)?', name: 'chat', component: () => import('@/pages/ChatPage.vue') },
      { path: 'settings', component: () => import('@/pages/SettingsPage.vue') },
      { path: 'admin', component: () => import('@/pages/AdminPage.vue'), meta: { admin: true } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/chat' },
]

export const router = createRouter({
  history: createWebHistory('/'),
  routes,
})

router.beforeEach((to) => {
  const user = session.user

  if (to.matched.some((r) => r.meta.auth) && !user) {
    return { path: '/login', query: to.fullPath !== '/chat' ? { redirect: to.fullPath } : {} }
  }
  if (to.meta.guest && user) {
    return '/chat'
  }
  // UI convenience only; the API enforces admin authorization server-side.
  if (to.meta.admin && !user?.is_admin) {
    return '/chat'
  }
  return true
})

/** Only allow internal redirects (prevents open-redirect via ?redirect=). */
export function safeRedirect(value: unknown): string {
  return typeof value === 'string' && /^\/(?!\/)[\w\-/]*$/.test(value) ? value : '/chat'
}

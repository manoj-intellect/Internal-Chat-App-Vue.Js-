<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'
import { RouterLink, RouterView, useRouter } from 'vue-router'
import { logout, session } from '@/stores/session'
import { chat, loadConversations, startChatServices, stopChatServices, totalUnread } from '@/stores/chat'

const router = useRouter()

onMounted(async () => {
  startChatServices((path) => void router.push(path))
  await loadConversations().catch(() => undefined)
})
onBeforeUnmount(stopChatServices)

watch(totalUnread, (n) => {
  document.title = n > 0 ? `(${n}) ${session.appName}` : session.appName
})

async function signOut() {
  stopChatServices()
  await logout().catch(() => undefined)
  await router.replace('/login')
}
</script>

<template>
  <div class="shell">
    <header class="topbar">
      <RouterLink to="/chat" class="brand">{{ session.appName }}</RouterLink>
      <nav class="nav" aria-label="Main">
        <RouterLink to="/chat" class="nav-link">
          Chat <span v-if="totalUnread" class="badge" :aria-label="`${totalUnread} unread`">{{ totalUnread > 99 ? '99+' : totalUnread }}</span>
        </RouterLink>
        <RouterLink to="/settings" class="nav-link">Settings</RouterLink>
        <RouterLink v-if="session.user?.is_admin" to="/admin" class="nav-link">Admin</RouterLink>
      </nav>
      <span
        class="conn"
        :class="chat.realtime"
        :title="chat.realtime === 'connected' ? 'Live updates connected' : 'Live updates unavailable — refreshing periodically'"
      >
        <span class="dot" aria-hidden="true" />
        <span class="conn-label">{{ chat.realtime === 'connected' ? 'Live' : chat.realtime === 'connecting' ? 'Connecting' : 'Polling' }}</span>
      </span>
      <span class="user muted small">{{ session.user?.name }}</span>
      <button type="button" class="btn btn-sm" @click="signOut">Sign out</button>
    </header>
    <main class="content">
      <RouterView />
    </main>
  </div>
</template>

<style scoped>
.shell { display: flex; flex-direction: column; height: 100%; }
.topbar { display: flex; align-items: center; gap: 14px; padding: calc(8px + env(safe-area-inset-top)) 14px 8px; background: var(--panel); border-bottom: 1px solid var(--border); }
.brand { font-weight: 800; text-decoration: none; color: var(--text); white-space: nowrap; }
.nav { display: flex; gap: 4px; flex: 1; }
.nav-link { text-decoration: none; color: var(--muted); padding: 6px 10px; border-radius: 6px; display: inline-flex; gap: 6px; align-items: center; }
.nav-link.router-link-active { color: var(--text); background: var(--panel-2); font-weight: 600; }
.conn { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--muted); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--warn); }
.conn.connected .dot { background: var(--success); }
.content { flex: 1; min-height: 0; }
@media (max-width: 640px) {
  .user, .conn-label { display: none; }
  .topbar { gap: 8px; padding-left: 10px; padding-right: 10px; }
  .brand { display: none; }
}
</style>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import ConversationList from '@/components/ConversationList.vue'
import MessageThread from '@/components/MessageThread.vue'
import NewConversationDialog from '@/components/NewConversationDialog.vue'
import GroupPanel from '@/components/GroupPanel.vue'
import NotificationToggle from '@/components/NotificationToggle.vue'
import { activeConversation, chat, loadConversations, openConversation } from '@/stores/chat'
import { session } from '@/stores/session'
import { chatApi } from '@/services/api'
import { errorMessage } from '@/services/http'
import { formatListTime } from '@/utils/format'
import { toPlainText } from '@/utils/formatter'

const route = useRoute()
const router = useRouter()

const showNew = ref(false)
const showInfo = ref(false)
const searchOpen = ref(false)
const searchQuery = ref('')
const searchResults = ref<Awaited<ReturnType<typeof chatApi.search>>>([])
const searchError = ref('')
const searching = ref(false)

const routeId = computed(() => (route.params.id ? Number(route.params.id) : null))

watch(
  [routeId, () => chat.loaded],
  async ([id, loaded]) => {
    showInfo.value = false
    if (!id) {
      chat.activeId = null
      return
    }
    if (!loaded) return
    if (!chat.conversations.some((c) => c.id === id)) {
      // Possibly a brand-new conversation (e.g. opened from a notification).
      await loadConversations().catch(() => undefined)
      if (!chat.conversations.some((c) => c.id === id)) {
        await router.replace('/chat')
        return
      }
    }
    await openConversation(id).catch(() => undefined)
  },
  { immediate: true },
)

function select(id: number) {
  void router.push(`/chat/${id}`)
}

async function runSearch() {
  const q = searchQuery.value.trim()
  if (q.length < 2) return
  searching.value = true
  searchError.value = ''
  try {
    searchResults.value = await chatApi.search(q)
  } catch (e) {
    searchError.value = errorMessage(e)
  } finally {
    searching.value = false
  }
}

function conversationName(id: number, fallback: string | null) {
  return chat.conversations.find((c) => c.id === id)?.name ?? fallback ?? 'Conversation'
}
</script>

<template>
  <div class="chat" :class="{ 'has-active': !!routeId }">
    <aside class="sidebar" aria-label="Conversations">
      <div class="side-head">
        <h1>Chats</h1>
        <div class="side-actions">
          <button type="button" class="icon-btn" :aria-pressed="searchOpen" aria-label="Search messages" title="Search messages" @click="searchOpen = !searchOpen">🔍</button>
          <button type="button" class="btn btn-primary btn-sm" @click="showNew = true">+ New</button>
        </div>
      </div>

      <div v-if="searchOpen" class="search">
        <form class="search-form" @submit.prevent="runSearch">
          <label class="sr-only" for="msg-search">Search messages</label>
          <input id="msg-search" v-model="searchQuery" class="input" type="search" placeholder="Search messages…" minlength="2" maxlength="100" />
          <button class="btn btn-sm" :disabled="searching || searchQuery.trim().length < 2">Go</button>
        </form>
        <p class="muted small hint">Secure content is never searchable.</p>
        <div v-if="searchError" class="field-error">{{ searchError }}</div>
        <ul class="results">
          <li v-for="r in searchResults" :key="r.message.id">
            <button type="button" class="result" @click="select(r.conversation.id); searchOpen = false">
              <span class="small"><strong>{{ conversationName(r.conversation.id, r.conversation.name) }}</strong> · {{ formatListTime(r.message.created_at) }}</span>
              <span class="muted small snippet">{{ r.message.sender?.name }}: {{ toPlainText(r.message.body).slice(0, 120) }}</span>
            </button>
          </li>
          <li v-if="!searching && searchQuery && !searchResults.length" class="muted small">No results.</li>
        </ul>
      </div>

      <ConversationList v-else :conversations="chat.conversations" :active-id="chat.activeId" :me-id="session.user?.id" @select="select" />

      <NotificationToggle compact />
    </aside>

    <section class="main">
      <MessageThread v-if="activeConversation" :key="activeConversation.id" :conversation="activeConversation"
        @back="router.push('/chat')" @info="showInfo = !showInfo" />
      <div v-else class="placeholder muted">
        <p>Select a conversation or start a new one.</p>
      </div>
    </section>

    <GroupPanel v-if="showInfo && activeConversation?.type === 'group'" :conversation="activeConversation"
      @close="showInfo = false" @left="showInfo = false; router.push('/chat'); loadConversations()" />

    <NewConversationDialog v-if="showNew" @close="showNew = false" @created="(id) => { showNew = false; select(id) }" />
  </div>
</template>

<style scoped>
.chat { display: flex; height: 100%; min-height: 0; }
.sidebar { width: 320px; flex: none; display: flex; flex-direction: column; background: var(--panel); border-right: 1px solid var(--border); min-height: 0; }
.side-head { display: flex; justify-content: space-between; align-items: center; padding: 12px; }
.side-head h1 { margin: 0; font-size: 18px; }
.side-actions { display: flex; gap: 6px; align-items: center; }
.main { flex: 1; min-width: 0; min-height: 0; }
.placeholder { height: 100%; display: grid; place-items: center; text-align: center; padding: 20px; }
.search { padding: 0 12px; flex: 1; overflow-y: auto; }
.search-form { display: flex; gap: 6px; }
.hint { margin: 6px 0; }
.results { list-style: none; margin: 0; padding: 0; }
.result { display: grid; gap: 2px; width: 100%; text-align: left; border: 0; background: transparent; padding: 8px 4px; border-bottom: 1px solid var(--border); cursor: pointer; }
.result:hover { background: var(--panel-2); }
.snippet { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Mobile: one pane at a time. */
@media (max-width: 800px) {
  .sidebar { width: 100%; border-right: 0; }
  .chat.has-active .sidebar { display: none; }
  .chat:not(.has-active) .main { display: none; }
}
</style>

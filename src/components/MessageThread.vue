<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import MessageItem from './MessageItem.vue'
import MessageComposer from './MessageComposer.vue'
import { chat, loadOlder, markRead } from '@/stores/chat'
import { session } from '@/stores/session'
import { formatDayLabel } from '@/utils/format'
import type { Conversation, Message } from '@/types'

const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ back: []; info: [] }>()

const scroller = ref<HTMLElement | null>(null)
const thread = computed(() => chat.threads[props.conversation.id])
const messages = computed(() => thread.value?.items ?? [])
const meId = computed(() => session.user?.id)

interface Row {
  key: string
  day?: string
  message?: Message
  showSender: boolean
}

const rows = computed<Row[]>(() => {
  const out: Row[] = []
  let lastDay = ''
  let lastSender: number | null | undefined
  for (const m of messages.value) {
    const day = new Date(m.created_at).toDateString()
    if (day !== lastDay) {
      out.push({ key: `d-${day}`, day: formatDayLabel(m.created_at), showSender: false })
      lastDay = day
      lastSender = undefined
    }
    const senderId = m.type === 'system' ? null : m.sender?.id
    out.push({ key: `m-${m.id}`, message: m, showSender: props.conversation.type === 'group' && senderId !== lastSender })
    lastSender = senderId
  }
  return out
})

function nearBottom(): boolean {
  const el = scroller.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 120
}

async function scrollToBottom() {
  await nextTick()
  if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
}

// Infinite scroll upwards, keeping the viewport anchored.
async function onScroll() {
  const el = scroller.value
  if (!el || el.scrollTop > 80 || !thread.value || thread.value.loading || thread.value.loadedAll) return
  const before = el.scrollHeight
  await loadOlder(props.conversation.id)
  await nextTick()
  el.scrollTop = el.scrollHeight - before + el.scrollTop
}

watch(
  () => props.conversation.id,
  () => void scrollToBottom(),
  { immediate: true },
)

watch(
  () => messages.value.at(-1)?.id,
  async (newest, previous) => {
    if (newest === previous) return
    const mineNewest = messages.value.at(-1)?.sender?.id === meId.value
    if (mineNewest || nearBottom() || previous === undefined) {
      await scrollToBottom()
      if (document.visibilityState === 'visible') void markRead(props.conversation.id)
    }
  },
)
</script>

<template>
  <section class="thread" :aria-label="`Conversation ${conversation.name}`">
    <header class="thread-head">
      <button type="button" class="icon-btn back" aria-label="Back to conversations" @click="emit('back')">←</button>
      <div class="title">
        <h2>{{ conversation.name }}</h2>
        <span class="muted small">
          <template v-if="conversation.type === 'group'">{{ conversation.member_count }} members</template>
          <template v-else-if="conversation.direct_user?.status !== 'active'">Account {{ conversation.direct_user?.status }}</template>
          <template v-else>Private conversation</template>
        </span>
      </div>
      <button v-if="conversation.type === 'group'" type="button" class="btn btn-sm" @click="emit('info')">Members</button>
    </header>

    <div ref="scroller" class="scroller" role="log" aria-live="polite" @scroll.passive="onScroll">
      <div v-if="thread?.loading" class="muted small center">Loading…</div>
      <div v-else-if="thread?.loadedAll && messages.length" class="muted small center">Beginning of conversation</div>
      <div v-if="thread && !thread.loading && !messages.length" class="empty muted">No messages yet. Say hello 👋</div>

      <template v-for="row in rows" :key="row.key">
        <div v-if="row.day" class="day"><span>{{ row.day }}</span></div>
        <MessageItem v-else-if="row.message" :message="row.message" :mine="row.message.sender?.id === meId" :show-sender="row.showSender" />
      </template>
    </div>

    <MessageComposer :conversation-id="conversation.id" />
  </section>
</template>

<style scoped>
.thread { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--bg); }
.thread-head { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--border); background: var(--panel); }
.title { flex: 1; min-width: 0; }
.title h2 { margin: 0; font-size: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.back { display: none; font-size: 18px; }
.scroller { flex: 1; overflow-y: auto; padding: 8px 16px 16px; overscroll-behavior: contain; }
.center { text-align: center; padding: 8px; }
.empty { text-align: center; margin-top: 30vh; }
.day { display: flex; justify-content: center; margin: 14px 0 6px; }
.day span { font-size: 12px; color: var(--muted); background: var(--panel); border: 1px solid var(--border); padding: 1px 10px; border-radius: 999px; }
@media (max-width: 800px) { .back { display: inline-block; } .scroller { padding: 8px 10px 12px; } }
</style>

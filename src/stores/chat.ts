import { computed, reactive } from 'vue'
import { chatApi } from '@/services/api'
import { connectRealtime, type RealtimeStatus } from '@/services/realtime'
import { initNotifications, notificationMode, showLocalNotification } from '@/services/push'
import { toPlainText } from '@/utils/formatter'
import { session } from './session'
import type { Conversation, Message } from '@/types'

interface Thread {
  items: Message[] // oldest -> newest
  nextCursor: string | null
  loadedAll: boolean
  loading: boolean
}

export const chat = reactive({
  conversations: [] as Conversation[],
  loaded: false,
  activeId: null as number | null,
  threads: {} as Record<number, Thread>,
  realtime: 'disabled' as RealtimeStatus,
})

export const totalUnread = computed(() => chat.conversations.reduce((sum, c) => sum + c.unread_count, 0))
export const activeConversation = computed(() => chat.conversations.find((c) => c.id === chat.activeId) ?? null)

let pollTimer: number | null = null
let listPollCounter = 0
let navigate: (path: string) => void = () => {}

const viewingConversation = (id: number) => chat.activeId === id && document.visibilityState === 'visible' && document.hasFocus()

function sortConversations(): void {
  const ts = (c: Conversation) => Date.parse(c.last_message_at ?? c.created_at) || 0
  chat.conversations.sort((a, b) => ts(b) - ts(a))
}

export async function loadConversations(): Promise<void> {
  chat.conversations = await chatApi.conversations()
  chat.loaded = true
}

async function refreshConversation(id: number): Promise<void> {
  try {
    const fresh = await chatApi.conversation(id)
    const index = chat.conversations.findIndex((c) => c.id === id)
    if (index >= 0) chat.conversations.splice(index, 1, { ...chat.conversations[index], ...fresh })
    else chat.conversations.push(fresh)
    sortConversations()
  } catch {
    removeConversation(id) // no longer accessible
  }
}

function removeConversation(id: number): void {
  chat.conversations = chat.conversations.filter((c) => c.id !== id)
  delete chat.threads[id]
  if (chat.activeId === id) {
    chat.activeId = null
    navigate('/chat')
  }
}

function thread(id: number): Thread {
  return (chat.threads[id] ??= { items: [], nextCursor: null, loadedAll: false, loading: false })
}

export async function openConversation(id: number): Promise<void> {
  chat.activeId = id
  const t = thread(id)
  if (!t.items.length && !t.loadedAll) {
    await loadOlder(id)
  }
  await markRead(id)
}

export async function loadOlder(id: number): Promise<void> {
  const t = thread(id)
  if (t.loading || t.loadedAll) return
  t.loading = true
  try {
    const page = await chatApi.messages(id, t.nextCursor)
    const known = new Set(t.items.map((m) => m.id))
    const older = page.items.filter((m) => !known.has(m.id)).reverse()
    t.items = [...older, ...t.items]
    t.nextCursor = page.nextCursor
    t.loadedAll = !page.nextCursor
  } finally {
    t.loading = false
  }
}

export async function markRead(id: number): Promise<void> {
  const conversation = chat.conversations.find((c) => c.id === id)
  const lastId = chat.threads[id]?.items.at(-1)?.id
  if (conversation) conversation.unread_count = 0
  if (lastId && conversation?.last_read_message_id !== lastId) {
    if (conversation) conversation.last_read_message_id = lastId
    await chatApi.markRead(id, lastId).catch(() => undefined)
  }
}

export async function sendMessage(conversationId: number, body: string, secrets: string[], attachmentIds: number[]): Promise<void> {
  const message = await chatApi.send(conversationId, body, secrets, attachmentIds)
  receiveMessage(message, { fromSelf: true })
}

export async function deleteMessage(message: Message): Promise<void> {
  await chatApi.deleteMessage(message.id)
  removeMessage(message.conversation_id, message.id)
}

function removeMessage(conversationId: number, messageId: number): void {
  const t = chat.threads[conversationId]
  if (t) t.items = t.items.filter((m) => m.id !== messageId)
}

function receiveMessage(message: Message, opts: { fromSelf?: boolean } = {}): void {
  const conversation = chat.conversations.find((c) => c.id === message.conversation_id)
  if (!conversation) {
    // New conversation (e.g. someone just started a chat with us).
    void refreshConversation(message.conversation_id)
    return
  }

  const t = chat.threads[message.conversation_id]
  if (t && !t.items.some((m) => m.id === message.id)) {
    // Only append if we already hold the latest page (keeps ordering correct).
    t.items.push(message)
  }

  const mine = message.sender?.id === session.user?.id
  conversation.last_message = {
    id: message.id,
    type: message.type,
    sender_id: message.sender?.id ?? null,
    sender_name: message.sender?.name ?? null,
    preview: message.type === 'attachment' && !message.body ? '📎 Attachment' : toPlainText(message.body).slice(0, 80),
    created_at: message.created_at,
  }
  conversation.last_message_at = message.created_at
  sortConversations()

  if (mine || opts.fromSelf) return

  if (viewingConversation(message.conversation_id)) {
    void markRead(message.conversation_id)
    return
  }

  conversation.unread_count += 1

  // With FCM active, the push itself produces the notification (SW or
  // foreground handler); otherwise notify locally while the app is open.
  if (notificationMode.value !== 'push' && message.type !== 'system') {
    const title = conversation.type === 'group' ? conversation.name : `New message from ${message.sender?.name ?? 'someone'}`
    void showLocalNotification(title, 'You have a new message.', `/chat/${conversation.id}`, `conversation-${conversation.id}`)
  }
}

/* ---------------------------- realtime wiring ---------------------------- */

export function startChatServices(go: (path: string) => void): void {
  navigate = go
  const user = session.user
  const config = session.config
  if (!user || !config) return

  connectRealtime(config.realtime, user.id, {
    onMessage: (m) => receiveMessage(m),
    onMessageDeleted: removeMessage,
    onConversationUpdated: (id, reason, removed) => {
      if (removed.includes(user.id) || reason === 'deleted') removeConversation(id)
      else void refreshConversation(id)
    },
    onConversationRead: (id, lastRead) => {
      const c = chat.conversations.find((x) => x.id === id)
      if (c) {
        c.unread_count = 0
        c.last_read_message_id = lastRead
      }
    },
    onStatusChange: (status) => {
      chat.realtime = status
      // Socket down or disabled: fall back to polling. Connected: stop polling.
      if (status === 'connected') stopPolling()
      else if (status !== 'connecting') startPolling(config.realtime.poll_seconds)
    },
  })

  void initNotifications(config, user.id, (data) => {
    // Foreground FCM message (tab visible). Skip if already viewing that chat.
    const id = Number(data.conversation_id)
    if (!id || viewingConversation(id)) return
    void showLocalNotification(data.title ?? 'New message', data.body ?? 'You have a new message.', `/chat/${id}`, data.tag ?? `conversation-${id}`)
  })

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', onVisibility)
}

export function stopChatServices(): void {
  stopPolling()
  document.removeEventListener('visibilitychange', onVisibility)
  window.removeEventListener('focus', onVisibility)
  chat.conversations = []
  chat.threads = {}
  chat.activeId = null
  chat.loaded = false
}

function onVisibility(): void {
  if (chat.activeId && document.visibilityState === 'visible') void markRead(chat.activeId)
}

function startPolling(seconds: number): void {
  if (pollTimer !== null) return
  pollTimer = window.setInterval(() => void poll(), Math.max(5, seconds) * 1000)
}

function stopPolling(): void {
  if (pollTimer !== null) window.clearInterval(pollTimer)
  pollTimer = null
}

async function poll(): Promise<void> {
  if (!session.user) return stopPolling()
  try {
    const id = chat.activeId
    const last = id ? chat.threads[id]?.items.at(-1)?.id : undefined
    if (id && last) {
      for (const m of await chatApi.messagesAfter(id, last)) receiveMessage(m)
    }
    // Refresh the list (unread counts / new chats) every 3rd tick.
    if (++listPollCounter % 3 === 0) {
      const active = chat.activeId
      await loadConversations()
      if (active) {
        const c = chat.conversations.find((x) => x.id === active)
        if (c && viewingConversation(active)) c.unread_count = 0
      }
    }
  } catch {
    /* transient; next tick retries */
  }
}

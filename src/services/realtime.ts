import Echo from 'laravel-echo'
import Pusher, { type ChannelAuthorizationCallback } from 'pusher-js'
import { ref } from 'vue'
import { http } from './http'
import type { ClientConfig, Message } from '@/types'

export type RealtimeStatus = 'disabled' | 'connecting' | 'connected' | 'unavailable'

export interface RealtimeHandlers {
  onMessage: (message: Message) => void
  onMessageDeleted: (conversationId: number, messageId: number) => void
  onConversationUpdated: (conversationId: number, reason: string, removedUserIds: number[]) => void
  onConversationRead: (conversationId: number, lastReadMessageId: number | null) => void
  onStatusChange: (status: RealtimeStatus) => void
}

export const realtimeStatus = ref<RealtimeStatus>('disabled')

let echo: Echo<'reverb'> | null = null

/**
 * Connects to Laravel Reverb and subscribes to the user's single private
 * channel. Channel authorization goes through /broadcasting/auth with the
 * session cookie + CSRF header (same axios instance as the API).
 */
export function connectRealtime(config: ClientConfig['realtime'], userId: number, handlers: RealtimeHandlers): void {
  disconnectRealtime()

  const setStatus = (status: RealtimeStatus) => {
    realtimeStatus.value = status
    handlers.onStatusChange(status)
  }

  if (!config.enabled || !config.key) {
    setStatus('disabled')
    return
  }

  ;(window as unknown as { Pusher: typeof Pusher }).Pusher = Pusher
  const tls = config.scheme === 'https'

  echo = new Echo({
    broadcaster: 'reverb',
    key: config.key,
    wsHost: config.host,
    wsPort: config.port,
    wssPort: config.port,
    forceTLS: tls,
    enabledTransports: tls ? ['wss'] : ['ws', 'wss'],
    authorizer: (channel: { name: string }) => ({
      authorize: (socketId: string, callback: ChannelAuthorizationCallback) => {
        http
          .post('/broadcasting/auth', { socket_id: socketId, channel_name: channel.name })
          .then((response) => callback(null, response.data as { auth: string }))
          .catch((error) => callback(error instanceof Error ? error : new Error('auth failed'), null))
      },
    }),
  })

  setStatus('connecting')
  const connection = (echo.connector as unknown as { pusher: Pusher }).pusher.connection
  connection.bind('state_change', ({ current }: { current: string }) => {
    if (current === 'connected') setStatus('connected')
    else if (current === 'connecting' || current === 'initialized') setStatus('connecting')
    else setStatus('unavailable') // unavailable | failed | disconnected -> polling fallback
  })

  echo
    .private(`users.${userId}`)
    .listen('.message.sent', (e: { message: Message }) => handlers.onMessage(e.message))
    .listen('.message.deleted', (e: { conversation_id: number; message_id: number }) =>
      handlers.onMessageDeleted(e.conversation_id, e.message_id),
    )
    .listen('.conversation.updated', (e: { conversation_id: number; reason: string; removed_user_ids: number[] }) =>
      handlers.onConversationUpdated(e.conversation_id, e.reason, e.removed_user_ids ?? []),
    )
    .listen('.conversation.read', (e: { conversation_id: number; last_read_message_id: number | null }) =>
      handlers.onConversationRead(e.conversation_id, e.last_read_message_id),
    )
}

export function disconnectRealtime(): void {
  echo?.disconnect()
  echo = null
  realtimeStatus.value = 'disabled'
}

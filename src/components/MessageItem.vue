<script setup lang="ts">
import { computed, ref } from 'vue'
import FormattedMessage from './FormattedMessage'
import { deleteMessage } from '@/stores/chat'
import { apiUrl, errorMessage } from '@/services/http'
import { formatBytes, formatTime } from '@/utils/format'
import type { Message } from '@/types'

const props = defineProps<{ message: Message; mine: boolean; showSender: boolean }>()

const confirming = ref(false)
const error = ref('')
const secretIds = computed(() => props.message.secrets.map((s) => s.id))

async function remove() {
  try {
    await deleteMessage(props.message)
  } catch (e) {
    error.value = errorMessage(e, 'Could not delete.')
  } finally {
    confirming.value = false
  }
}
</script>

<template>
  <div v-if="message.type === 'system'" class="system" role="note">
    <!-- System notices are rendered as plain text, never formatted. -->
    {{ message.body }} · {{ formatTime(message.created_at) }}
  </div>

  <article v-else class="msg" :class="{ mine }" :aria-label="`Message from ${message.sender?.name ?? 'unknown'}`">
    <header v-if="showSender || mine" class="meta">
      <strong v-if="showSender && !mine">{{ message.sender?.name ?? 'Former member' }}</strong>
      <time :datetime="message.created_at">{{ formatTime(message.created_at) }}</time>
      <span v-if="mine" class="actions">
        <template v-if="confirming">
          <button type="button" class="btn btn-sm btn-danger" @click="remove">Delete</button>
          <button type="button" class="btn btn-sm" @click="confirming = false">Cancel</button>
        </template>
        <button v-else type="button" class="icon-btn del" aria-label="Delete message" title="Delete message" @click="confirming = true">🗑</button>
      </span>
    </header>

    <div class="bubble">
      <FormattedMessage v-if="message.body" :body="message.body" :message-id="message.id" :secret-ids="secretIds" />

      <ul v-if="message.attachments.length" class="attachments">
        <li v-for="a in message.attachments" :key="a.id">
          <a v-if="a.is_image && a.preview_url" :href="apiUrl(a.download_url)" class="thumb" :title="a.name">
            <img :src="apiUrl(a.preview_url)" :alt="a.name" loading="lazy" />
          </a>
          <a :href="apiUrl(a.download_url)" class="file" rel="noopener">📎 {{ a.name }} <span class="muted small">{{ formatBytes(a.size) }}</span></a>
        </li>
      </ul>
      <div v-if="error" class="field-error">{{ error }}</div>
    </div>
  </article>
</template>

<style scoped>
.system { text-align: center; color: var(--muted); font-size: 12.5px; margin: 10px 0; }
.msg { max-width: min(680px, 88%); margin: 2px 0; }
.msg.mine { margin-left: auto; }
.meta { display: flex; gap: 8px; align-items: baseline; font-size: 12.5px; color: var(--muted); margin: 8px 4px 2px; }
.mine .meta { justify-content: flex-end; }
.meta strong { color: var(--text); }
.actions { opacity: 0; transition: opacity .1s; display: inline-flex; gap: 4px; }
.msg:hover .actions, .msg:focus-within .actions { opacity: 1; }
.del { min-width: 24px; min-height: 24px; padding: 0 4px; font-size: 12px; }
.bubble { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px; overflow-wrap: anywhere; }
.mine .bubble { background: var(--mine); border-color: transparent; }
.attachments { list-style: none; padding: 0; margin: 6px 0 0; display: grid; gap: 6px; }
.thumb img { max-width: 240px; max-height: 200px; border-radius: 8px; display: block; border: 1px solid var(--border); }
.file { text-decoration: none; }
@media (hover: none) { .actions { opacity: 1; } }
</style>

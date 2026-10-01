<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatListTime, initials } from '@/utils/format'
import type { Conversation } from '@/types'

const props = defineProps<{ conversations: Conversation[]; activeId: number | null; meId: number | undefined }>()
const emit = defineEmits<{ select: [id: number] }>()

const filter = ref('')
const filtered = computed(() => {
  const q = filter.value.trim().toLowerCase()
  return q ? props.conversations.filter((c) => c.name.toLowerCase().includes(q)) : props.conversations
})

function preview(c: Conversation): string {
  const last = c.last_message
  if (!last) return c.type === 'group' ? 'Group created' : 'No messages yet'
  if (last.type === 'system') return last.preview
  const who = last.sender_id === props.meId ? 'You: ' : c.type === 'group' && last.sender_name ? `${last.sender_name.split(' ')[0]}: ` : ''
  return who + (last.preview || (last.type === 'attachment' ? '📎 Attachment' : ''))
}
</script>

<template>
  <div class="list-wrap">
    <label class="sr-only" for="conv-filter">Filter conversations</label>
    <input id="conv-filter" v-model="filter" class="input filter" type="search" placeholder="Search conversations" maxlength="100" />

    <ul class="list" role="listbox" aria-label="Conversations">
      <li v-for="c in filtered" :key="c.id">
        <button
          type="button"
          class="item"
          role="option"
          :aria-selected="c.id === activeId"
          :class="{ active: c.id === activeId, unread: c.unread_count > 0 }"
          @click="emit('select', c.id)"
        >
          <span class="avatar" :class="c.type" aria-hidden="true">{{ c.type === 'group' ? '#' : initials(c.name) }}</span>
          <span class="body">
            <span class="line1">
              <span class="name">{{ c.name }}</span>
              <span class="time">{{ formatListTime(c.last_message_at) }}</span>
            </span>
            <span class="line2">
              <span class="preview">{{ preview(c) }}</span>
              <span v-if="c.unread_count > 0" class="badge" :aria-label="`${c.unread_count} unread`">{{ c.unread_count > 99 ? '99+' : c.unread_count }}</span>
            </span>
          </span>
        </button>
      </li>
      <li v-if="!filtered.length" class="muted small none">No conversations{{ filter ? ' match' : ' yet' }}.</li>
    </ul>
  </div>
</template>

<style scoped>
.list-wrap { display: flex; flex-direction: column; min-height: 0; flex: 1; }
.filter { margin: 0 12px 8px; width: calc(100% - 24px); }
.list { list-style: none; margin: 0; padding: 0 6px 12px; overflow-y: auto; flex: 1; }
.item { display: flex; gap: 10px; width: 100%; text-align: left; border: 0; background: transparent; padding: 9px 8px; border-radius: 8px; cursor: pointer; align-items: center; }
.item:hover { background: var(--panel-2); }
.item.active { background: var(--accent-soft); }
.avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; font-weight: 700; font-size: 13px; background: var(--panel-2); border: 1px solid var(--border); color: var(--muted); }
.avatar.group { border-radius: 10px; }
.body { flex: 1; min-width: 0; display: grid; gap: 1px; }
.line1, .line2 { display: flex; justify-content: space-between; gap: 8px; align-items: center; }
.name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.time { font-size: 12px; color: var(--muted); flex: none; }
.preview { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.unread .name, .unread .preview { color: var(--text); font-weight: 700; }
.none { padding: 12px; }
</style>

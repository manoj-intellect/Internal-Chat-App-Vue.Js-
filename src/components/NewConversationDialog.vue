<script setup lang="ts">
import { onMounted, ref } from 'vue'
import UserPicker from './UserPicker.vue'
import { chatApi } from '@/services/api'
import { errorMessage } from '@/services/http'
import { loadConversations } from '@/stores/chat'
import type { DirectoryUser } from '@/types'

const emit = defineEmits<{ close: []; created: [id: number] }>()

const dialog = ref<HTMLDialogElement | null>(null)
const mode = ref<'direct' | 'group'>('direct')
const groupName = ref('')
const members = ref<DirectoryUser[]>([])
const busy = ref(false)
const error = ref('')

onMounted(() => dialog.value?.showModal())

async function startDirect(user: DirectoryUser) {
  busy.value = true
  error.value = ''
  try {
    const conversation = await chatApi.startDirect(user.id)
    await loadConversations()
    emit('created', conversation.id)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}

function toggleMember(user: DirectoryUser) {
  members.value = members.value.some((m) => m.id === user.id)
    ? members.value.filter((m) => m.id !== user.id)
    : [...members.value, user]
}

async function createGroup() {
  busy.value = true
  error.value = ''
  try {
    const conversation = await chatApi.createGroup(groupName.value.trim(), members.value.map((m) => m.id))
    await loadConversations()
    emit('created', conversation.id)
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <dialog ref="dialog" class="dialog" aria-labelledby="new-conv-title" @close="emit('close')">
    <header class="dialog-head">
      <h2 id="new-conv-title">New conversation</h2>
      <button type="button" class="icon-btn" aria-label="Close" @click="dialog?.close()">✕</button>
    </header>

    <div class="tabs" role="tablist">
      <button type="button" role="tab" :aria-selected="mode === 'direct'" class="tab" @click="mode = 'direct'">Private chat</button>
      <button type="button" role="tab" :aria-selected="mode === 'group'" class="tab" @click="mode = 'group'">Group</button>
    </div>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>

    <div v-if="mode === 'direct'">
      <UserPicker @pick="startDirect" />
    </div>

    <form v-else @submit.prevent="createGroup">
      <div class="field">
        <label for="group-name">Group name</label>
        <input id="group-name" v-model="groupName" class="input" maxlength="100" required placeholder="e.g. Development Team" />
      </div>
      <div v-if="members.length" class="selected">
        <span v-for="m in members" :key="m.id" class="pill">{{ m.name }}</span>
      </div>
      <UserPicker multiple :selected="members.map((m) => m.id)" @pick="toggleMember" />
      <div class="actions">
        <button type="button" class="btn" @click="dialog?.close()">Cancel</button>
        <button class="btn btn-primary" :disabled="busy || groupName.trim().length < 2">
          Create group{{ members.length ? ` (${members.length + 1})` : '' }}
        </button>
      </div>
    </form>
  </dialog>
</template>

<style scoped>
.dialog { width: min(480px, calc(100vw - 24px)); border: 1px solid var(--border); border-radius: 12px; padding: 18px; background: var(--panel); color: var(--text); box-shadow: 0 20px 50px rgb(0 0 0 / 25%); }
.dialog::backdrop { background: rgb(10 14 22 / 45%); }
.dialog-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.dialog-head h2 { margin: 0; font-size: 18px; }
.tabs { display: flex; gap: 4px; margin-bottom: 12px; border-bottom: 1px solid var(--border); }
.tab { border: 0; background: transparent; padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--muted); }
.tab[aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
.selected { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
.actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px; }
</style>

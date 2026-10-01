<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import UserPicker from './UserPicker.vue'
import { chatApi } from '@/services/api'
import { errorMessage } from '@/services/http'
import { session } from '@/stores/session'
import type { Conversation, DirectoryUser, Member } from '@/types'

/**
 * Group details. Buttons are shown according to the user's role for
 * convenience only - every action is authorized again by the API.
 */
const props = defineProps<{ conversation: Conversation }>()
const emit = defineEmits<{ close: []; left: [] }>()

const members = ref<Member[]>([])
const adding = ref(false)
const renaming = ref(false)
const newName = ref('')
const error = ref('')
const confirmLeave = ref(false)

const meId = computed(() => session.user?.id)
const myRole = computed(() => members.value.find((m) => m.id === meId.value)?.role ?? props.conversation.my_role)
const canManage = computed(() => myRole.value === 'owner' || myRole.value === 'admin')
const isOwner = computed(() => myRole.value === 'owner')

async function load() {
  try {
    members.value = await chatApi.members(props.conversation.id)
  } catch (e) {
    error.value = errorMessage(e)
  }
}

onMounted(load)
watch(() => [props.conversation.id, props.conversation.member_count], load)

async function run(action: () => Promise<unknown>) {
  error.value = ''
  try {
    await action()
    await load()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

const canRemove = (m: Member) => m.id !== meId.value && m.role !== 'owner' && (isOwner.value || (myRole.value === 'admin' && m.role === 'member'))

const add = (u: DirectoryUser) => run(() => chatApi.addMembers(props.conversation.id, [u.id]))
const remove = (m: Member) => run(() => chatApi.removeMember(props.conversation.id, m.id))
const setRole = (m: Member, role: string) => run(() => chatApi.changeRole(props.conversation.id, m.id, role))

async function rename() {
  await run(() => chatApi.renameGroup(props.conversation.id, newName.value.trim()))
  renaming.value = false
}

async function leave() {
  try {
    await chatApi.leave(props.conversation.id)
    emit('left')
  } catch (e) {
    error.value = errorMessage(e)
  }
}
</script>

<template>
  <aside class="panel" aria-label="Group details">
    <header class="head">
      <h3>Group details</h3>
      <button type="button" class="icon-btn" aria-label="Close" @click="emit('close')">✕</button>
    </header>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>

    <section>
      <div v-if="!renaming" class="name-row">
        <strong>{{ conversation.name }}</strong>
        <button v-if="canManage" type="button" class="btn btn-sm" @click="renaming = true; newName = conversation.name">Rename</button>
      </div>
      <form v-else class="name-row" @submit.prevent="rename">
        <input v-model="newName" class="input" maxlength="100" aria-label="Group name" />
        <button class="btn btn-sm btn-primary" :disabled="newName.trim().length < 2">Save</button>
        <button type="button" class="btn btn-sm" @click="renaming = false">Cancel</button>
      </form>
    </section>

    <section>
      <div class="section-head">
        <h4>Members ({{ members.length }})</h4>
        <button v-if="canManage" type="button" class="btn btn-sm" @click="adding = !adding">{{ adding ? 'Done' : 'Add' }}</button>
      </div>
      <UserPicker v-if="adding" :exclude-ids="members.map((m) => m.id)" @pick="add" />
      <ul class="members">
        <li v-for="m in members" :key="m.id">
          <span class="who">
            {{ m.name }}<span v-if="m.id === meId" class="muted"> (you)</span>
            <span v-if="m.role !== 'member'" class="pill">{{ m.role }}</span>
            <span v-if="m.status !== 'active'" class="pill pill-warn">{{ m.status }}</span>
          </span>
          <span class="ops">
            <button v-if="isOwner && m.id !== meId && m.role === 'member'" type="button" class="btn btn-sm" @click="setRole(m, 'admin')">Make admin</button>
            <button v-if="isOwner && m.role === 'admin'" type="button" class="btn btn-sm" @click="setRole(m, 'member')">Remove admin</button>
            <button v-if="canRemove(m)" type="button" class="btn btn-sm btn-danger" @click="remove(m)">Remove</button>
          </span>
        </li>
      </ul>
    </section>

    <section class="leave">
      <template v-if="confirmLeave">
        <p class="small">Leave this group? You will lose access to its history.</p>
        <button type="button" class="btn btn-danger" @click="leave">Leave group</button>
        <button type="button" class="btn" @click="confirmLeave = false">Cancel</button>
      </template>
      <button v-else type="button" class="btn btn-danger" @click="confirmLeave = true">Leave group</button>
    </section>
  </aside>
</template>

<style scoped>
.panel { width: 320px; max-width: 100%; border-left: 1px solid var(--border); background: var(--panel); padding: 12px 14px; overflow-y: auto; height: 100%; }
.head, .section-head, .name-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.head h3 { margin: 0; font-size: 16px; }
section { margin: 14px 0; }
h4 { margin: 0; font-size: 13px; text-transform: uppercase; color: var(--muted); letter-spacing: .03em; }
.members { list-style: none; padding: 0; margin: 8px 0 0; }
.members li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px; padding: 7px 0; border-bottom: 1px solid var(--border); align-items: center; }
.who { display: inline-flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ops { display: inline-flex; gap: 4px; }
.leave { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
@media (max-width: 1100px) {
  .panel { position: fixed; inset: 0 0 0 auto; width: min(360px, 100vw); z-index: 20; box-shadow: -8px 0 30px rgb(0 0 0 / 20%); }
}
</style>

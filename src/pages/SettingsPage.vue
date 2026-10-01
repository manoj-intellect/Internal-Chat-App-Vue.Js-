<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import NotificationToggle from '@/components/NotificationToggle.vue'
import { authApi, chatApi } from '@/services/api'
import { errorMessage } from '@/services/http'
import { session } from '@/stores/session'
import { formatDateTime } from '@/utils/format'
import type { NotificationPreferences } from '@/types'

const prefs = ref<NotificationPreferences | null>(null)
const prefsError = ref('')
const devices = ref<Awaited<ReturnType<typeof chatApi.devices>>>([])

const pw = reactive({ current_password: '', password: '', password_confirmation: '' })
const pwMessage = ref('')
const pwError = ref('')
const pwBusy = ref(false)

onMounted(async () => {
  try {
    prefs.value = await chatApi.preferences()
    devices.value = await chatApi.devices()
  } catch (e) {
    prefsError.value = errorMessage(e)
  }
})

async function updatePref(key: keyof NotificationPreferences, value: boolean) {
  prefsError.value = ''
  try {
    prefs.value = await chatApi.updatePreferences({ [key]: value })
  } catch (e) {
    prefsError.value = errorMessage(e)
  }
}

async function removeDevice(id: number) {
  await chatApi.removeDevice(id).catch((e) => (prefsError.value = errorMessage(e)))
  devices.value = await chatApi.devices()
}

async function changePassword() {
  pwError.value = pwMessage.value = ''
  if (pw.password !== pw.password_confirmation) {
    pwError.value = 'New passwords do not match.'
    return
  }
  pwBusy.value = true
  try {
    await authApi.changePassword(pw)
    pwMessage.value = 'Password updated. Other sessions have been signed out.'
    pw.current_password = pw.password = pw.password_confirmation = ''
  } catch (e) {
    pwError.value = errorMessage(e)
  } finally {
    pwBusy.value = false
  }
}
</script>

<template>
  <div class="page">
    <h1>Settings</h1>

    <section class="card section">
      <h2>Notifications</h2>
      <NotificationToggle />
      <p class="muted small">
        Notifications only say that a new message arrived. Secure content is never included.
      </p>

      <div v-if="prefsError" class="alert alert-error">{{ prefsError }}</div>
      <div v-if="prefs" class="prefs">
        <label class="pref"><input type="checkbox" :checked="prefs.push_enabled" @change="updatePref('push_enabled', ($event.target as HTMLInputElement).checked)" /> Push notifications</label>
        <label class="pref"><input type="checkbox" :checked="prefs.private_messages" :disabled="!prefs.push_enabled" @change="updatePref('private_messages', ($event.target as HTMLInputElement).checked)" /> Private messages</label>
        <label class="pref"><input type="checkbox" :checked="prefs.group_messages" :disabled="!prefs.push_enabled" @change="updatePref('group_messages', ($event.target as HTMLInputElement).checked)" /> Group messages</label>
        <label class="pref" :title="session.config?.push.previews_allowed ? '' : 'Disabled by your organisation'">
          <input type="checkbox" :checked="prefs.previews" :disabled="!prefs.push_enabled || !session.config?.push.previews_allowed"
            @change="updatePref('previews', ($event.target as HTMLInputElement).checked)" />
          Message previews <span v-if="!session.config?.push.previews_allowed" class="muted small">(disabled by organisation)</span>
        </label>
      </div>

      <h3>Devices receiving push notifications</h3>
      <ul class="devices">
        <li v-for="d in devices" :key="d.id">
          <span>{{ d.browser ?? 'Browser' }} · {{ d.device_name ?? d.platform }} <span class="muted small">last used {{ formatDateTime(d.last_used_at) }}</span></span>
          <button type="button" class="btn btn-sm btn-danger" @click="removeDevice(d.id)">Remove</button>
        </li>
        <li v-if="!devices.length" class="muted small">No devices registered.</li>
      </ul>
    </section>

    <section class="card section">
      <h2>Change password</h2>
      <div v-if="pwMessage" class="alert alert-info">{{ pwMessage }}</div>
      <div v-if="pwError" class="alert alert-error">{{ pwError }}</div>
      <form class="pw-form" @submit.prevent="changePassword">
        <div class="field">
          <label for="cur">Current password</label>
          <input id="cur" v-model="pw.current_password" class="input" type="password" autocomplete="current-password" maxlength="128" required />
        </div>
        <div class="field">
          <label for="new">New password</label>
          <input id="new" v-model="pw.password" class="input" type="password" autocomplete="new-password" maxlength="128" required />
        </div>
        <div class="field">
          <label for="conf">Confirm new password</label>
          <input id="conf" v-model="pw.password_confirmation" class="input" type="password" autocomplete="new-password" maxlength="128" required />
        </div>
        <button class="btn btn-primary" :disabled="pwBusy">Update password</button>
      </form>
    </section>
  </div>
</template>

<style scoped>
.page { max-width: 760px; margin: 0 auto; padding: 20px 16px 40px; overflow-y: auto; height: 100%; }
.page h1 { font-size: 22px; margin: 0 0 16px; }
.section { padding: 18px; margin-bottom: 18px; }
.section h2 { margin: 0 0 12px; font-size: 17px; }
.section h3 { margin: 18px 0 8px; font-size: 14px; }
.prefs { display: grid; gap: 8px; margin-top: 12px; }
.pref { display: flex; gap: 8px; align-items: center; }
.devices { list-style: none; padding: 0; margin: 0; }
.devices li { display: flex; justify-content: space-between; gap: 8px; padding: 7px 0; border-bottom: 1px solid var(--border); align-items: center; flex-wrap: wrap; }
.pw-form { max-width: 380px; }
</style>

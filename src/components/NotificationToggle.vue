<script setup lang="ts">
import { computed, ref } from 'vue'
import { disableNotifications, enableNotifications, notificationMode, notificationState } from '@/services/push'
import { errorMessage } from '@/services/http'

defineProps<{ compact?: boolean }>()

const error = ref('')

const label = computed(() => {
  switch (notificationState.value) {
    case 'enabled':
      return notificationMode.value === 'push' ? 'Notifications enabled' : 'Notifications enabled (while app is open)'
    case 'denied':
      return 'Notifications blocked in browser settings'
    case 'unsupported':
      return 'Notifications not supported in this browser'
    case 'working':
      return 'Updating…'
    default:
      return 'Notifications disabled'
  }
})

async function toggle() {
  error.value = ''
  try {
    if (notificationState.value === 'enabled') await disableNotifications()
    else await enableNotifications()
  } catch (e) {
    error.value = errorMessage(e, 'Could not update notifications.')
  }
}
</script>

<template>
  <div class="notif" :class="{ compact }">
    <span class="status" :class="notificationState" role="status">🔔 {{ label }}</span>
    <!-- Permission is only ever requested from this explicit click. After a
         denial we do not ask again; the user must change browser settings. -->
    <button
      v-if="notificationState === 'disabled' || notificationState === 'enabled' || notificationState === 'working'"
      type="button"
      class="btn btn-sm"
      :class="{ 'btn-primary': notificationState === 'disabled' }"
      :disabled="notificationState === 'working'"
      @click="toggle"
    >
      {{ notificationState === 'enabled' ? 'Disable' : 'Enable notifications' }}
    </button>
    <span v-if="error" class="field-error">{{ error }}</span>
  </div>
</template>

<style scoped>
.notif { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.status.enabled { color: var(--success); }
.status.denied { color: var(--danger); }
.compact { padding: 8px 12px; border-top: 1px solid var(--border); }
</style>

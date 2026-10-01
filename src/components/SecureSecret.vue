<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { chatApi } from '@/services/api'
import { errorMessage } from '@/services/http'

/**
 * A secure-content placeholder. The secret is fetched ONLY when the user
 * clicks Reveal (server re-checks membership, decrypts, audits), kept in this
 * component's memory only, and hidden again automatically.
 */
const props = defineProps<{ messageId: number; secretId: number }>()

const AUTO_HIDE_MS = 30_000

const value = ref<string | null>(null)
const loading = ref(false)
const error = ref('')
const copied = ref(false)
let hideTimer: number | undefined

async function reveal() {
  error.value = ''
  loading.value = true
  try {
    const result = await chatApi.revealSecret(props.messageId, props.secretId)
    value.value = result.value
    window.clearTimeout(hideTimer)
    hideTimer = window.setTimeout(hide, AUTO_HIDE_MS)
  } catch (e) {
    error.value = errorMessage(e, 'Unable to reveal.')
  } finally {
    loading.value = false
  }
}

function hide() {
  value.value = null
  copied.value = false
  window.clearTimeout(hideTimer)
}

async function copy() {
  if (value.value === null) return
  try {
    await navigator.clipboard.writeText(value.value)
    copied.value = true
    window.setTimeout(() => (copied.value = false), 2000)
  } catch {
    error.value = 'Copy failed.'
  }
}

onBeforeUnmount(hide)
</script>

<template>
  <span class="secret" :class="{ revealed: value !== null }">
    <span aria-hidden="true">🔒</span>
    <template v-if="value !== null">
      <code class="secret-value" aria-label="Secure content">{{ value }}</code>
      <button type="button" class="secret-btn" @click="copy">{{ copied ? 'Copied' : 'Copy' }}</button>
      <button type="button" class="secret-btn" @click="hide">Hide</button>
    </template>
    <template v-else>
      <span class="secret-label">Secure content</span>
      <button type="button" class="secret-btn" :disabled="loading" @click="reveal">{{ loading ? '…' : 'Reveal' }}</button>
    </template>
    <span v-if="error" class="secret-error" role="alert">{{ error }}</span>
  </span>
</template>

<style scoped>
.secret {
  display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap;
  padding: 1px 4px 1px 8px; border-radius: 6px; vertical-align: middle;
  background: var(--secure-soft); border: 1px dashed var(--secure); color: var(--secure);
  font-size: 13px; max-width: 100%;
}
.secret.revealed { border-style: solid; }
.secret-label { font-weight: 600; }
.secret-value { font-family: var(--mono); color: var(--text); word-break: break-all; user-select: all; }
.secret-btn {
  border: 1px solid var(--secure); background: var(--panel); color: var(--secure);
  border-radius: 4px; padding: 0 6px; font-size: 12px; cursor: pointer; line-height: 20px;
}
.secret-error { color: var(--danger); font-size: 12px; }
</style>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { chatApi } from '@/services/api'
import { errorMessage } from '@/services/http'
import { session } from '@/stores/session'
import { sendMessage } from '@/stores/chat'
import { ComposeError, composeMessage, marker, MARKER_PATTERN, prefixLines, wrapSelection, type EditResult } from '@/utils/composer'
import { formatBytes } from '@/utils/format'
import type { Attachment } from '@/types'

const props = defineProps<{ conversationId: number }>()

const draft = ref('')
const textarea = ref<HTMLTextAreaElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const sending = ref(false)
const error = ref('')

// Secure values live ONLY in this component's memory; never persisted.
const secretValues = reactive(new Map<number, string>())
let secretCounter = 0
const secureInputOpen = ref(false)
const secureInput = ref('')
const secureInputEl = ref<HTMLInputElement | null>(null)

const linkOpen = ref(false)
const linkUrl = ref('https://')

interface PendingUpload {
  key: number
  name: string
  size: number
  progress: number
  attachment: Attachment | null
  error: string
}
const uploads = ref<PendingUpload[]>([])
let uploadKey = 0

const config = computed(() => session.config)
const maxLength = computed(() => config.value?.messages.max_length ?? 5000)
const activeSecretIds = computed(() => [...draft.value.matchAll(MARKER_PATTERN)].map((m) => Number(m[1])).filter((id) => secretValues.has(id)))
const uploading = computed(() => uploads.value.some((u) => !u.attachment && !u.error))
const canSend = computed(
  () => !sending.value && !uploading.value && (draft.value.trim() !== '' || uploads.value.some((u) => u.attachment)),
)

function resetComposer() {
  draft.value = ''
  secretValues.clear()
  secureInput.value = ''
  secureInputOpen.value = false
  linkOpen.value = false
  error.value = ''
  for (const u of uploads.value) if (u.attachment) void chatApi.discardUpload(u.attachment.id).catch(() => undefined)
  uploads.value = []
}

// Switching conversations discards drafts (and any secure values) entirely.
watch(() => props.conversationId, resetComposer)
onBeforeUnmount(() => {
  secretValues.clear()
  secureInput.value = ''
})

/* ------------------------------ editing ------------------------------ */

function selection() {
  const el = textarea.value!
  return { text: draft.value, start: el.selectionStart, end: el.selectionEnd }
}

async function apply(result: EditResult) {
  draft.value = result.text
  await nextTick()
  textarea.value?.focus()
  textarea.value?.setSelectionRange(result.selectionStart, result.selectionEnd)
}

const format = {
  bold: () => apply(wrapSelection(selection(), '**')),
  italic: () => apply(wrapSelection(selection(), '*')),
  underline: () => apply(wrapSelection(selection(), '__')),
  code: () => {
    const sel = selection()
    const multiline = sel.text.slice(sel.start, sel.end).includes('\n')
    return apply(multiline ? wrapSelection(sel, '```\n', '\n```', 'code') : wrapSelection(sel, '`', '`', 'code'))
  },
  bullet: () => apply(prefixLines(selection(), () => '- ')),
  numbered: () => apply(prefixLines(selection(), (i) => `${i + 1}. `)),
  quote: () => apply(prefixLines(selection(), () => '> ')),
}

function openLink() {
  linkUrl.value = 'https://'
  linkOpen.value = true
}

function insertLink() {
  const url = linkUrl.value.trim()
  if (!/^(https?:\/\/|mailto:)\S+$/i.test(url)) {
    error.value = 'Links must start with https://, http:// or mailto:'
    return
  }
  linkOpen.value = false
  const sel = selection()
  void apply(wrapSelection(sel, '[', `](${url})`, 'link text'))
}

/** Mark the selection as secure, or open the input to type a secure value. */
function markSecure() {
  const sel = selection()
  const chosen = sel.text.slice(sel.start, sel.end)
  if (chosen && !MARKER_PATTERN.test(chosen)) {
    MARKER_PATTERN.lastIndex = 0
    insertSecret(chosen, sel.start, sel.end)
  } else {
    MARKER_PATTERN.lastIndex = 0
    secureInputOpen.value = true
    void nextTick(() => secureInputEl.value?.focus())
  }
}

function addSecureFromInput() {
  const value = secureInput.value
  if (!value) return
  const el = textarea.value!
  insertSecret(value, el.selectionStart, el.selectionEnd)
  secureInput.value = ''
  secureInputOpen.value = false
}

function insertSecret(value: string, start: number, end: number) {
  const max = config.value?.secrets.max_per_message ?? 10
  const maxLen = config.value?.secrets.max_length ?? 2000
  if (activeSecretIds.value.length >= max) {
    error.value = `A message can contain at most ${max} secure items.`
    return
  }
  if (value.length > maxLen) {
    error.value = `Secure content is limited to ${maxLen} characters.`
    return
  }
  const id = ++secretCounter
  secretValues.set(id, value)
  const token = marker(id)
  void apply({ text: draft.value.slice(0, start) + token + draft.value.slice(end), selectionStart: start + token.length, selectionEnd: start + token.length })
}

function removeSecret(id: number) {
  secretValues.delete(id)
  draft.value = draft.value.replace(marker(id), '')
}

/* ---------------------------- attachments ---------------------------- */

function pickFiles() {
  fileInput.value?.click()
}

async function onFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const limits = config.value?.attachments
  if (!limits) return

  for (const file of files) {
    if (uploads.value.length >= limits.max_per_message) {
      error.value = `At most ${limits.max_per_message} attachments per message.`
      break
    }
    const ext = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : ''
    const entry = reactive<PendingUpload>({ key: ++uploadKey, name: file.name, size: file.size, progress: 0, attachment: null, error: '' })
    uploads.value.push(entry)

    // Fast client-side feedback; the server re-validates by content.
    if (file.size > limits.max_size_mb * 1024 * 1024) {
      entry.error = `Larger than ${limits.max_size_mb} MB`
      continue
    }
    if (!limits.allowed_types.includes(ext)) {
      entry.error = 'File type not allowed'
      continue
    }
    try {
      entry.attachment = await chatApi.upload(props.conversationId, file, (p) => (entry.progress = p))
    } catch (e) {
      entry.error = errorMessage(e, 'Upload failed')
    }
  }
}

function removeUpload(upload: PendingUpload) {
  uploads.value = uploads.value.filter((u) => u.key !== upload.key)
  if (upload.attachment) void chatApi.discardUpload(upload.attachment.id).catch(() => undefined)
}

/* ------------------------------- send ------------------------------- */

async function send() {
  if (!canSend.value) return
  error.value = ''

  let composed
  try {
    composed = composeMessage(draft.value, secretValues)
  } catch (e) {
    error.value = e instanceof ComposeError ? e.message : 'Invalid message.'
    return
  }
  if (composed.body.length > maxLength.value) {
    error.value = `Messages are limited to ${maxLength.value} characters.`
    return
  }

  const attachmentIds = uploads.value.filter((u) => u.attachment).map((u) => u.attachment!.id)
  sending.value = true
  try {
    await sendMessage(props.conversationId, composed.body, composed.secrets, attachmentIds)
    draft.value = ''
    secretValues.clear()
    uploads.value = []
    await nextTick()
    textarea.value?.focus()
  } catch (e) {
    error.value = errorMessage(e, 'Message not sent.')
  } finally {
    sending.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault()
    void send()
    return
  }
  if (e.ctrlKey || e.metaKey) {
    const key = e.key.toLowerCase()
    if (key === 'b' || key === 'i' || key === 'u') {
      e.preventDefault()
      void (key === 'b' ? format.bold() : key === 'i' ? format.italic() : format.underline())
    }
  }
}
</script>

<template>
  <div class="composer">
    <div v-if="error" class="alert alert-error composer-error" role="alert">
      {{ error }} <button type="button" class="icon-btn" aria-label="Dismiss" @click="error = ''">✕</button>
    </div>

    <div v-if="uploads.length" class="chips">
      <span v-for="u in uploads" :key="u.key" class="chip" :class="{ 'chip-error': u.error }">
        📎 {{ u.name }} <span class="muted">({{ formatBytes(u.size) }})</span>
        <span v-if="u.error" class="field-error">— {{ u.error }}</span>
        <span v-else-if="!u.attachment" class="muted">{{ u.progress }}%</span>
        <button type="button" class="chip-x" :aria-label="`Remove ${u.name}`" @click="removeUpload(u)">✕</button>
      </span>
    </div>

    <div v-if="activeSecretIds.length" class="chips">
      <span v-for="id in activeSecretIds" :key="id" class="chip chip-secure">
        🔒 secure {{ id }} <span class="muted">({{ secretValues.get(id)!.length }} chars, encrypted on send)</span>
        <button type="button" class="chip-x" :aria-label="`Remove secure item ${id}`" @click="removeSecret(id)">✕</button>
      </span>
    </div>

    <form v-if="secureInputOpen" class="inline-form" @submit.prevent="addSecureFromInput">
      <label class="sr-only" for="secure-value">Secure value</label>
      <input id="secure-value" ref="secureInputEl" v-model="secureInput" class="input" type="password" autocomplete="off"
        placeholder="Type the secret (e.g. a password)" :maxlength="config?.secrets.max_length ?? 2000" />
      <button class="btn btn-primary btn-sm" :disabled="!secureInput">Add secure</button>
      <button type="button" class="btn btn-sm" @click="secureInputOpen = false; secureInput = ''">Cancel</button>
    </form>

    <form v-if="linkOpen" class="inline-form" @submit.prevent="insertLink">
      <label class="sr-only" for="link-url">Link URL</label>
      <input id="link-url" v-model="linkUrl" class="input" type="url" placeholder="https://" maxlength="2000" />
      <button class="btn btn-primary btn-sm">Insert link</button>
      <button type="button" class="btn btn-sm" @click="linkOpen = false">Cancel</button>
    </form>

    <div class="toolbar" role="toolbar" aria-label="Formatting">
      <button type="button" class="icon-btn" title="Bold (Ctrl+B)" aria-label="Bold" @click="format.bold"><b>B</b></button>
      <button type="button" class="icon-btn" title="Italic (Ctrl+I)" aria-label="Italic" @click="format.italic"><i>I</i></button>
      <button type="button" class="icon-btn" title="Underline (Ctrl+U)" aria-label="Underline" @click="format.underline"><u>U</u></button>
      <button type="button" class="icon-btn" title="Code" aria-label="Code" @click="format.code">&lt;/&gt;</button>
      <button type="button" class="icon-btn" title="Bulleted list" aria-label="Bulleted list" @click="format.bullet">•≡</button>
      <button type="button" class="icon-btn" title="Numbered list" aria-label="Numbered list" @click="format.numbered">1≡</button>
      <button type="button" class="icon-btn" title="Quote" aria-label="Quote" @click="format.quote">❝</button>
      <button type="button" class="icon-btn" title="Link" aria-label="Insert link" @click="openLink">🔗</button>
      <button type="button" class="icon-btn secure-btn" title="Mark selection as secure (encrypted)" aria-label="Secure content" @click="markSecure">🔒 Secure</button>
      <span class="spacer" />
      <span class="muted small" :class="{ 'field-error': draft.length > maxLength }">{{ draft.length > maxLength * 0.8 ? `${draft.length}/${maxLength}` : '' }}</span>
    </div>

    <div class="row">
      <button type="button" class="icon-btn attach" title="Attach file" aria-label="Attach file" @click="pickFiles">📎</button>
      <input ref="fileInput" type="file" class="sr-only" multiple tabindex="-1"
        :accept="config?.attachments.allowed_types.map((t) => '.' + t).join(',')" @change="onFiles" />
      <label class="sr-only" for="composer-input">Message</label>
      <textarea id="composer-input" ref="textarea" v-model="draft" class="textarea" rows="2"
        placeholder="Write a message… (Enter to send, Shift+Enter for a new line)" @keydown="onKeydown" />
      <button type="button" class="btn btn-primary send" :disabled="!canSend" @click="send">{{ sending ? '…' : 'Send' }}</button>
    </div>
  </div>
</template>

<style scoped>
.composer { border-top: 1px solid var(--border); background: var(--panel); padding: 8px 12px calc(10px + env(safe-area-inset-bottom)); }
.composer-error { display: flex; justify-content: space-between; align-items: center; padding: 4px 8px; margin-bottom: 6px; }
.toolbar { display: flex; align-items: center; gap: 2px; flex-wrap: wrap; margin-bottom: 4px; }
.spacer { flex: 1; }
.secure-btn { color: var(--secure); font-size: 13px; }
.row { display: flex; gap: 8px; align-items: flex-end; }
.row .textarea { resize: none; max-height: 200px; min-height: 44px; }
.send { min-height: 44px; }
.attach { min-height: 44px; font-size: 18px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 6px; }
.chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px 2px 10px; border-radius: 999px; background: var(--panel-2); border: 1px solid var(--border); font-size: 13px; max-width: 100%; }
.chip-secure { background: var(--secure-soft); border-color: var(--secure); color: var(--secure); }
.chip-error { border-color: var(--danger); }
.chip-x { border: 0; background: transparent; cursor: pointer; color: var(--muted); padding: 0 4px; }
.inline-form { display: flex; gap: 6px; margin-bottom: 6px; }
@media (max-width: 640px) {
  .toolbar .icon-btn { padding: 4px 6px; min-width: 28px; }
}
</style>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { chatApi } from '@/services/api'
import { errorMessage } from '@/services/http'
import type { DirectoryUser } from '@/types'

const props = withDefaults(defineProps<{ multiple?: boolean; excludeIds?: number[]; selected?: number[] }>(), {
  multiple: false,
  excludeIds: () => [],
  selected: () => [],
})
const emit = defineEmits<{ pick: [user: DirectoryUser] }>()

const query = ref('')
const results = ref<DirectoryUser[]>([])
const loading = ref(false)
const error = ref('')
let timer: number | undefined

async function search() {
  loading.value = true
  error.value = ''
  try {
    results.value = (await chatApi.users(query.value.trim())).filter((u) => !props.excludeIds.includes(u.id))
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    loading.value = false
  }
}

watch(query, () => {
  window.clearTimeout(timer)
  timer = window.setTimeout(search, 250)
})
onMounted(search)
onBeforeUnmount(() => window.clearTimeout(timer))
</script>

<template>
  <div class="picker">
    <label class="sr-only" for="user-search">Search people</label>
    <input id="user-search" v-model="query" class="input" type="search" placeholder="Search by name or email" maxlength="100" autofocus />
    <div v-if="error" class="field-error">{{ error }}</div>
    <ul class="results" :aria-busy="loading">
      <li v-for="u in results" :key="u.id">
        <button type="button" class="person" :aria-pressed="multiple ? selected.includes(u.id) : undefined" @click="emit('pick', u)">
          <span v-if="multiple" class="check" aria-hidden="true">{{ selected.includes(u.id) ? '☑' : '☐' }}</span>
          <span class="who"><strong>{{ u.name }}</strong><span class="muted small">{{ u.email }}</span></span>
        </button>
      </li>
      <li v-if="!loading && !results.length" class="muted small pad">No people found.</li>
    </ul>
  </div>
</template>

<style scoped>
.results { list-style: none; margin: 8px 0 0; padding: 0; max-height: 300px; overflow-y: auto; }
.person { display: flex; gap: 10px; align-items: center; width: 100%; text-align: left; border: 0; background: transparent; padding: 8px; border-radius: 8px; cursor: pointer; }
.person:hover, .person[aria-pressed='true'] { background: var(--accent-soft); }
.who { display: grid; }
.check { font-size: 18px; }
.pad { padding: 8px; }
</style>

<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue'
import { adminApi, type AdminUser, type AuditEntry } from '@/services/api'
import { errorMessage } from '@/services/http'
import { session } from '@/stores/session'
import { formatDateTime } from '@/utils/format'

/**
 * Administration. Deliberately has NO access to conversation contents.
 * Every action is authorized server-side (`can:admin`).
 */
type Tab = 'users' | 'settings' | 'audit' | 'status'
const tab = ref<Tab>('users')
const error = ref('')
const notice = ref('')

/* ------------------------------ users ------------------------------ */
const users = ref<AdminUser[]>([])
const userQuery = reactive({ search: '', status: '', page: 1 })
const userPages = ref(1)
const newUser = reactive({ name: '', email: '', password: '', is_admin: false })
const showCreate = ref(false)

async function loadUsers() {
  try {
    const res = await adminApi.users({ ...userQuery, status: userQuery.status || undefined })
    users.value = res.data
    userPages.value = Number(res.meta?.last_page ?? 1)
  } catch (e) {
    error.value = errorMessage(e)
  }
}

async function setStatus(user: AdminUser, status: string) {
  error.value = ''
  try {
    Object.assign(user, await adminApi.updateUser(user.id, { status }))
    notice.value = `${user.name} is now ${status}.`
  } catch (e) {
    error.value = errorMessage(e)
  }
}

async function toggleAdmin(user: AdminUser) {
  error.value = ''
  try {
    Object.assign(user, await adminApi.updateUser(user.id, { is_admin: !user.is_admin }))
  } catch (e) {
    error.value = errorMessage(e)
  }
}

async function createUser() {
  error.value = ''
  try {
    await adminApi.createUser(newUser)
    notice.value = `Created ${newUser.email}.`
    Object.assign(newUser, { name: '', email: '', password: '', is_admin: false })
    showCreate.value = false
    await loadUsers()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

/* ----------------------------- settings ----------------------------- */
const settings = ref<Awaited<ReturnType<typeof adminApi.settings>> | null>(null)
const draft = reactive<Record<string, unknown>>({})
const domainsText = ref('')

async function loadSettings() {
  settings.value = await adminApi.settings()
  Object.assign(draft, settings.value.values)
  domainsText.value = ((draft.allowed_email_domains as string[]) ?? []).join(', ')
}

function toggleType(ext: string) {
  const list = new Set(draft.allowed_attachment_types as string[])
  if (list.has(ext)) list.delete(ext)
  else list.add(ext)
  draft.allowed_attachment_types = [...list]
}

async function saveSettings() {
  error.value = notice.value = ''
  const domains = domainsText.value.split(',').map((d) => d.trim().toLowerCase()).filter(Boolean)
  try {
    const result = await adminApi.updateSettings({ ...draft, allowed_email_domains: domains })
    Object.assign(draft, result.values)
    notice.value = 'Settings saved.'
  } catch (e) {
    error.value = errorMessage(e)
  }
}

const numericSettings = [
  ['max_attachment_size_mb', 'Max attachment size (MB)'],
  ['message_rate_limit', 'Messages per minute (per user)'],
  ['upload_rate_limit', 'Uploads per minute (per user)'],
  ['secret_reveal_rate_limit', 'Secure reveals per minute (per user)'],
  ['search_rate_limit', 'Searches per minute (per user)'],
  ['session_timeout', 'Idle session timeout (minutes)'],
] as const

/* ------------------------------- audit ------------------------------- */
const audit = ref<AuditEntry[]>([])
const auditQuery = reactive({ action: '', page: 1 })
const auditPages = ref(1)

async function loadAudit() {
  try {
    const res = await adminApi.auditLogs({ action: auditQuery.action || undefined, page: auditQuery.page })
    audit.value = res.data
    auditPages.value = Number(res.meta?.last_page ?? 1)
  } catch (e) {
    error.value = errorMessage(e)
  }
}

/* ------------------------------- status ------------------------------- */
const status = ref<Record<string, Record<string, unknown>> | null>(null)
const loadStatus = async () => (status.value = await adminApi.systemStatus())

async function loadTab() {
  error.value = notice.value = ''
  try {
    if (tab.value === 'users') await loadUsers()
    if (tab.value === 'settings') await loadSettings()
    if (tab.value === 'audit') await loadAudit()
    if (tab.value === 'status') await loadStatus()
  } catch (e) {
    error.value = errorMessage(e)
  }
}

watch(tab, loadTab)
onMounted(loadTab)
</script>

<template>
  <div class="page">
    <h1>Administration</h1>
    <div class="tabs" role="tablist">
      <button v-for="t in (['users', 'settings', 'audit', 'status'] as const)" :key="t" type="button" role="tab" class="tab"
        :aria-selected="tab === t" @click="tab = t">
        {{ { users: 'Users', settings: 'Settings', audit: 'Audit log', status: 'System status' }[t] }}
      </button>
    </div>

    <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
    <div v-if="notice" class="alert alert-info" role="status">{{ notice }}</div>

    <!-- USERS -->
    <section v-if="tab === 'users'" class="card section">
      <form class="filters" @submit.prevent="userQuery.page = 1; loadUsers()">
        <input v-model="userQuery.search" class="input" type="search" placeholder="Search name or email" maxlength="100" />
        <select v-model="userQuery.status" class="select" @change="userQuery.page = 1; loadUsers()">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive / pending</option>
          <option value="suspended">Suspended</option>
        </select>
        <button class="btn">Search</button>
        <button type="button" class="btn btn-primary" @click="showCreate = !showCreate">+ New user</button>
      </form>

      <form v-if="showCreate" class="create" @submit.prevent="createUser">
        <input v-model="newUser.name" class="input" placeholder="Full name" maxlength="100" required />
        <input v-model="newUser.email" class="input" type="email" placeholder="Email" maxlength="255" required />
        <input v-model="newUser.password" class="input" type="password" placeholder="Initial password" autocomplete="new-password" maxlength="128" required />
        <label class="inline"><input v-model="newUser.is_admin" type="checkbox" /> Administrator</label>
        <button class="btn btn-primary">Create</button>
      </form>

      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Name</th><th>Email</th><th>Status</th><th>Role</th><th>Last login</th><th>Devices</th><th>Actions</th></tr></thead>
          <tbody>
            <tr v-for="u in users" :key="u.id">
              <td>{{ u.name }}</td>
              <td>{{ u.email }}</td>
              <td><span class="pill" :class="{ 'pill-success': u.status === 'active', 'pill-danger': u.status === 'suspended', 'pill-warn': u.status === 'inactive' }">{{ u.status }}</span></td>
              <td>{{ u.is_admin ? 'Admin' : 'User' }}</td>
              <td class="small">{{ formatDateTime(u.last_login_at) }}</td>
              <td>{{ u.push_devices }}</td>
              <td class="actions">
                <template v-if="u.id !== session.user?.id">
                  <button v-if="u.status !== 'active'" type="button" class="btn btn-sm" @click="setStatus(u, 'active')">Activate</button>
                  <button v-if="u.status === 'active'" type="button" class="btn btn-sm" @click="setStatus(u, 'inactive')">Deactivate</button>
                  <button v-if="u.status !== 'suspended'" type="button" class="btn btn-sm btn-danger" @click="setStatus(u, 'suspended')">Suspend</button>
                  <button type="button" class="btn btn-sm" @click="toggleAdmin(u)">{{ u.is_admin ? 'Revoke admin' : 'Make admin' }}</button>
                </template>
                <span v-else class="muted small">You</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <button type="button" class="btn btn-sm" :disabled="userQuery.page <= 1" @click="userQuery.page--; loadUsers()">Previous</button>
        <span class="muted small">Page {{ userQuery.page }} / {{ userPages }}</span>
        <button type="button" class="btn btn-sm" :disabled="userQuery.page >= userPages" @click="userQuery.page++; loadUsers()">Next</button>
      </div>
    </section>

    <!-- SETTINGS -->
    <section v-if="tab === 'settings' && settings" class="card section">
      <form class="settings" @submit.prevent="saveSettings">
        <div v-for="[key, label] in numericSettings" :key="key" class="field">
          <label :for="key">{{ label }}</label>
          <input :id="key" v-model.number="draft[key]" class="input" type="number" min="1"
            :max="key === 'max_attachment_size_mb' ? settings.absolute_max_attachment_size_mb : undefined" />
          <span class="muted small">{{ settings.definitions[key]?.description }}</span>
        </div>

        <fieldset class="field">
          <legend>Allowed attachment types</legend>
          <div class="types">
            <label v-for="ext in settings.supported_attachment_types" :key="ext" class="inline">
              <input type="checkbox" :checked="(draft.allowed_attachment_types as string[]).includes(ext)" @change="toggleType(ext)" /> .{{ ext }}
            </label>
          </div>
        </fieldset>

        <label class="inline"><input v-model="draft.push_notifications_enabled" type="checkbox" /> Push notifications enabled (organisation-wide)</label>
        <label class="inline"><input v-model="draft.message_preview_enabled" type="checkbox" /> Allow message previews in notifications (users must also opt in)</label>

        <div class="field">
          <label for="reg">Self-registration</label>
          <select id="reg" v-model="draft.registration_mode" class="select">
            <option value="open">Open — accounts active immediately</option>
            <option value="approval">Approval — admin must activate new accounts</option>
            <option value="closed">Closed — admins create accounts</option>
          </select>
        </div>
        <div class="field">
          <label for="domains">Allowed email domains for registration (comma separated, empty = any)</label>
          <input id="domains" v-model="domainsText" class="input" placeholder="example.com, example.org" />
        </div>

        <button class="btn btn-primary">Save settings</button>
      </form>
    </section>

    <!-- AUDIT -->
    <section v-if="tab === 'audit'" class="card section">
      <form class="filters" @submit.prevent="auditQuery.page = 1; loadAudit()">
        <input v-model="auditQuery.action" class="input" placeholder="Filter by action prefix (e.g. auth. or secret.)" maxlength="64" />
        <button class="btn">Filter</button>
      </form>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Time</th><th>Action</th><th>User</th><th>Subject</th><th>IP</th><th>Details</th></tr></thead>
          <tbody>
            <tr v-for="a in audit" :key="a.id">
              <td class="small">{{ formatDateTime(a.created_at) }}</td>
              <td><code>{{ a.action }}</code></td>
              <td>{{ a.user?.name ?? '—' }}</td>
              <td class="small">{{ a.subject_type ? `${a.subject_type} #${a.subject_id}` : '—' }}</td>
              <td class="small">{{ a.ip_address }}</td>
              <td class="small"><code v-if="a.metadata">{{ JSON.stringify(a.metadata) }}</code></td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="pager">
        <button type="button" class="btn btn-sm" :disabled="auditQuery.page <= 1" @click="auditQuery.page--; loadAudit()">Previous</button>
        <span class="muted small">Page {{ auditQuery.page }} / {{ auditPages }}</span>
        <button type="button" class="btn btn-sm" :disabled="auditQuery.page >= auditPages" @click="auditQuery.page++; loadAudit()">Next</button>
      </div>
    </section>

    <!-- STATUS -->
    <section v-if="tab === 'status' && status" class="status-grid">
      <div v-for="(group, name) in status" :key="name" class="card section">
        <h2>{{ name }}</h2>
        <dl>
          <template v-for="(value, key) in group" :key="key">
            <dt>{{ String(key).replace(/_/g, ' ') }}</dt>
            <dd>
              <span v-if="typeof value === 'boolean'" class="pill" :class="value ? 'pill-success' : 'pill-warn'">{{ value ? 'yes' : 'no' }}</span>
              <code v-else-if="typeof value === 'object' && value !== null">{{ JSON.stringify(value) }}</code>
              <span v-else>{{ value ?? '—' }}</span>
            </dd>
          </template>
        </dl>
      </div>
      <button type="button" class="btn" @click="loadStatus">Refresh</button>
    </section>
  </div>
</template>

<style scoped>
.page { max-width: 1200px; margin: 0 auto; padding: 20px 16px 40px; overflow-y: auto; height: 100%; }
.page h1 { font-size: 22px; margin: 0 0 12px; }
.tabs { display: flex; gap: 4px; margin-bottom: 14px; border-bottom: 1px solid var(--border); overflow-x: auto; }
.tab { border: 0; background: transparent; padding: 8px 12px; cursor: pointer; border-bottom: 2px solid transparent; color: var(--muted); white-space: nowrap; }
.tab[aria-selected='true'] { color: var(--text); border-bottom-color: var(--accent); font-weight: 600; }
.section { padding: 16px; margin-bottom: 16px; }
.section h2 { margin: 0 0 8px; font-size: 15px; text-transform: capitalize; }
.filters, .create { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.filters .input, .create .input { flex: 1 1 180px; width: auto; }
.filters .select { width: auto; }
.inline { display: inline-flex; gap: 6px; align-items: center; margin: 4px 12px 4px 0; }
.actions { display: flex; gap: 4px; flex-wrap: wrap; }
.pager { display: flex; gap: 10px; align-items: center; justify-content: flex-end; margin-top: 10px; }
.settings { max-width: 560px; }
.types { display: flex; flex-wrap: wrap; }
fieldset { border: 1px solid var(--border); border-radius: 8px; padding: 10px; }
legend { font-size: 13px; font-weight: 600; color: var(--muted); }
.status-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px; align-items: start; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 0; font-size: 13px; }
dt { color: var(--muted); text-transform: capitalize; }
dd { margin: 0; word-break: break-word; }
</style>

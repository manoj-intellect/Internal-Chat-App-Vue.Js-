<script setup lang="ts">
import { reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { authApi } from '@/services/api'
import { ensureCsrfCookie, errorMessage, fieldErrors, type FieldErrors } from '@/services/http'
import { loadConfig, session, setUser } from '@/stores/session'
import type { CurrentUser } from '@/types'

const router = useRouter()
const form = reactive({ name: '', email: '', password: '', password_confirmation: '' })
const errors = ref<FieldErrors>({})
const error = ref('')
const success = ref('')
const busy = ref(false)

// Client-side checks mirror the server rules for fast feedback only;
// the server remains authoritative.
function validate(): boolean {
  const e: FieldErrors = {}
  if (form.name.trim().length < 2) e.name = ['Please enter your name.']
  if (!/^\S+@\S+\.\S+$/.test(form.email)) e.email = ['Please enter a valid email address.']
  if (form.password.length < 10 || !/[a-z]/.test(form.password) || !/[A-Z]/.test(form.password) || !/\d/.test(form.password)) {
    e.password = ['At least 10 characters with upper- and lower-case letters and a number.']
  }
  if (form.password !== form.password_confirmation) e.password_confirmation = ['Passwords do not match.']
  errors.value = e
  return Object.keys(e).length === 0
}

async function submit() {
  error.value = ''
  if (!validate()) return
  busy.value = true
  try {
    await ensureCsrfCookie()
    const result = await authApi.register({ ...form, name: form.name.trim(), email: form.email.trim() })
    form.password = form.password_confirmation = ''
    if ('requires_approval' in result.data) {
      success.value = result.message ?? 'Account created. An administrator must activate it.'
    } else {
      setUser(result.data as CurrentUser)
      await loadConfig()
      await router.replace('/chat')
    }
  } catch (e) {
    errors.value = fieldErrors(e)
    error.value = errorMessage(e, 'Registration failed.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-wrap">
    <div v-if="session.registrationMode === 'closed'" class="card auth-card">
      <h1>Registration closed</h1>
      <p class="sub">Accounts are created by an administrator.</p>
      <RouterLink to="/login">Back to sign in</RouterLink>
    </div>

    <div v-else-if="success" class="card auth-card">
      <h1>Thanks!</h1>
      <p class="sub">{{ success }}</p>
      <RouterLink to="/login">Back to sign in</RouterLink>
    </div>

    <form v-else class="card auth-card" novalidate @submit.prevent="submit">
      <h1>Create account</h1>
      <p class="sub">{{ session.appName }}</p>
      <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>

      <div class="field">
        <label for="name">Full name</label>
        <input id="name" v-model="form.name" class="input" autocomplete="name" maxlength="100" required />
        <span v-if="errors.name" class="field-error">{{ errors.name[0] }}</span>
      </div>
      <div class="field">
        <label for="email">Work email</label>
        <input id="email" v-model="form.email" class="input" type="email" autocomplete="email" maxlength="255" required />
        <span v-if="errors.email" class="field-error">{{ errors.email[0] }}</span>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" v-model="form.password" class="input" type="password" autocomplete="new-password" maxlength="128" required />
        <span v-if="errors.password" class="field-error">{{ errors.password[0] }}</span>
      </div>
      <div class="field">
        <label for="password_confirmation">Confirm password</label>
        <input id="password_confirmation" v-model="form.password_confirmation" class="input" type="password" autocomplete="new-password" maxlength="128" required />
        <span v-if="errors.password_confirmation" class="field-error">{{ errors.password_confirmation[0] }}</span>
      </div>

      <button class="btn btn-primary" style="width: 100%" type="submit" :disabled="busy">{{ busy ? 'Creating…' : 'Create account' }}</button>
      <div class="auth-links"><RouterLink to="/login">Already have an account?</RouterLink></div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { authApi } from '@/services/api'
import { ensureCsrfCookie, errorMessage } from '@/services/http'

// The reset token arrives in the URL *fragment* (#token=...&email=...), which
// browsers never send to servers, so it cannot end up in access logs.
const form = reactive({ token: '', email: '', password: '', password_confirmation: '' })
const busy = ref(false)
const done = ref('')
const error = ref('')

onMounted(() => {
  const params = new URLSearchParams(window.location.hash.slice(1))
  form.token = params.get('token') ?? ''
  form.email = params.get('email') ?? ''
  // Remove the token from the address bar / history.
  history.replaceState(null, '', window.location.pathname)
})

async function submit() {
  error.value = ''
  if (form.password !== form.password_confirmation) {
    error.value = 'Passwords do not match.'
    return
  }
  busy.value = true
  try {
    await ensureCsrfCookie()
    done.value = (await authApi.resetPassword(form)).message ?? 'Password reset.'
    form.token = form.password = form.password_confirmation = ''
  } catch (e) {
    error.value = errorMessage(e, 'This reset link is invalid or has expired.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-wrap">
    <div v-if="done" class="card auth-card">
      <h1>Password updated</h1>
      <p class="sub">{{ done }}</p>
      <RouterLink to="/login">Sign in</RouterLink>
    </div>
    <div v-else-if="!form.token" class="card auth-card">
      <h1>Invalid link</h1>
      <p class="sub">This reset link is incomplete. Request a new one.</p>
      <RouterLink to="/forgot-password">Request reset link</RouterLink>
    </div>
    <form v-else class="card auth-card" novalidate @submit.prevent="submit">
      <h1>Choose a new password</h1>
      <p class="sub">{{ form.email }}</p>
      <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
      <div class="field">
        <label for="password">New password</label>
        <input id="password" v-model="form.password" class="input" type="password" autocomplete="new-password" maxlength="128" required />
        <span class="muted small">At least 10 characters with upper- and lower-case letters and a number.</span>
      </div>
      <div class="field">
        <label for="password_confirmation">Confirm password</label>
        <input id="password_confirmation" v-model="form.password_confirmation" class="input" type="password" autocomplete="new-password" maxlength="128" required />
      </div>
      <button class="btn btn-primary" style="width: 100%" :disabled="busy">{{ busy ? 'Saving…' : 'Reset password' }}</button>
    </form>
  </main>
</template>

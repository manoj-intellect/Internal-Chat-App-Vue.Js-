<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { authApi } from '@/services/api'
import { ensureCsrfCookie, errorMessage } from '@/services/http'

const email = ref('')
const busy = ref(false)
const message = ref('')
const error = ref('')

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await ensureCsrfCookie()
    message.value = (await authApi.forgotPassword(email.value.trim())).message ?? 'Check your email.'
  } catch (e) {
    error.value = errorMessage(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-wrap">
    <form class="card auth-card" novalidate @submit.prevent="submit">
      <h1>Reset password</h1>
      <p class="sub">We'll email you a reset link.</p>
      <div v-if="message" class="alert alert-info" role="status">{{ message }}</div>
      <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>
      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" class="input" type="email" autocomplete="email" maxlength="255" required />
      </div>
      <button class="btn btn-primary" style="width: 100%" :disabled="busy || !email">{{ busy ? 'Sending…' : 'Send reset link' }}</button>
      <div class="auth-links"><RouterLink to="/login">Back to sign in</RouterLink></div>
    </form>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import { login, session } from '@/stores/session'
import { errorMessage } from '@/services/http'
import { safeRedirect } from '@/router'

const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

const notice = computed(() => {
  if (route.query.verified) return 'Email verified. You can sign in now.'
  switch (route.query.reason) {
    case 'expired':
      return 'Your session expired. Please sign in again.'
    case 'inactive':
      return 'Your account is not active.'
    case 'unauthenticated':
      return 'Please sign in to continue.'
    default:
      return ''
  }
})

async function submit() {
  error.value = ''
  busy.value = true
  try {
    await login(email.value.trim(), password.value)
    password.value = ''
    await router.replace(safeRedirect(route.query.redirect))
  } catch (e) {
    error.value = errorMessage(e, 'Unable to sign in.')
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="auth-wrap">
    <form class="card auth-card" novalidate @submit.prevent="submit">
      <h1>{{ session.appName }}</h1>
      <p class="sub">Sign in with your work account</p>

      <div v-if="notice" class="alert alert-info" role="status">{{ notice }}</div>
      <div v-if="error" class="alert alert-error" role="alert">{{ error }}</div>

      <div class="field">
        <label for="email">Email</label>
        <input id="email" v-model="email" class="input" type="email" autocomplete="username" required maxlength="255" autofocus />
      </div>
      <div class="field">
        <label for="password">Password</label>
        <input id="password" v-model="password" class="input" type="password" autocomplete="current-password" required maxlength="128" />
      </div>

      <button class="btn btn-primary" style="width: 100%" type="submit" :disabled="busy || !email || !password">
        {{ busy ? 'Signing in…' : 'Sign in' }}
      </button>

      <div class="auth-links">
        <RouterLink to="/forgot-password">Forgot password?</RouterLink>
        <RouterLink v-if="session.registrationMode !== 'closed'" to="/register">Create account</RouterLink>
      </div>
    </form>
  </main>
</template>

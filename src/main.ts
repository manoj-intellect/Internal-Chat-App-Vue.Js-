import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { bootstrapSession, clearSession } from './stores/session'
import { stopChatServices } from './stores/chat'
import { setUnauthorizedHandler } from './services/http'
import './styles.css'

setUnauthorizedHandler((reason) => {
  stopChatServices()
  clearSession()
  const current = router.currentRoute.value
  if (!current.meta.guest && !current.meta.public) {
    void router.replace({ path: '/login', query: { reason } })
  }
})

bootstrapSession().finally(() => {
  createApp(App).use(router).mount('#app')
})

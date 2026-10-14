import { createApp } from 'vue'
import * as Sentry from '@sentry/vue'
import App from './App.vue'
import router from './router'
import './styles/main.css'

// 错误追踪：无 DSN 不启用（与 server 同一降级原则；DSN 走构建环境变量 VITE_SENTRY_DSN）
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: (import.meta.env.VITE_SENTRY_ENV as string | undefined) ?? 'prod',
  })
}

createApp(App).use(router).mount('#app')

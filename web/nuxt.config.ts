export default defineNuxtConfig({
  ssr: true,
  runtimeConfig: {
    public: { apiBase: process.env.API_BASE || 'http://localhost:8000' },
  },
  css: ['~/assets/css/main.css'],
})

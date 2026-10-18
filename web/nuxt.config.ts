export default defineNuxtConfig({
  ssr: true,
  runtimeConfig: {
    public: { apiBase: process.env.API_BASE || 'http://localhost:8000' },
  },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: '好多星 HowDuoThink · 多想，多星。',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'description', content: '好多星 HowDuoThink —— 多想，多星。How to think. 把真实故障变成一桩桩案件，多想一步，星就多一颗。' },
      ],
    },
  },
})

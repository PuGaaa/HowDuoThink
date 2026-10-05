export default defineNuxtConfig({
  ssr: true,
  runtimeConfig: {
    public: { apiBase: process.env.API_BASE || 'http://localhost:8000' },
  },
  css: ['~/assets/css/main.css'],
  app: {
    head: {
      title: '好多星 HowDuoThink — 诊断思维训练场',
      htmlAttrs: { lang: 'zh-CN' },
      meta: [
        { name: 'description', content: '好多星 HowDuoThink —— 程序员的思维训练场。多想，多星。' },
      ],
    },
  },
})

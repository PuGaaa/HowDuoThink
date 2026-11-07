import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/api/client'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/features/auth/pages/LoginPage.vue'),
      meta: { public: true },
    },
    {
      path: '/',
      component: () => import('@/components/AdminLayout.vue'),
      children: [
        { path: '', redirect: '/overview' },
        {
          path: 'overview',
          name: 'overview',
          component: () => import('@/features/stats/pages/OverviewPage.vue'),
          meta: { title: '数据概览' },
        },
        {
          path: 'submissions',
          name: 'submissions',
          component: () => import('@/features/content/pages/SubmissionsPage.vue'),
          meta: { title: '投稿审核' },
        },
        {
          path: 'cases',
          name: 'cases',
          component: () => import('@/features/content/pages/CaseListPage.vue'),
          meta: { title: 'Case 管理' },
        },
        {
          path: "cases/:id",
          name: "case-edit",
          component: () => import("@/features/content/pages/CaseEditPage.vue"),
          meta: { title: "Case 编辑" },
        },
        {
          path: "assets",
          name: "assets",
          component: () => import("@/features/assets/pages/AssetsPage.vue"),
          meta: { title: "素材管理" },
        },
        {
          path: 'users',
          name: 'users',
          component: () => import('@/features/users/pages/UsersPage.vue'),
          meta: { title: '用户管理' },
        },
        {
          path: 'ai-usage',
          name: 'ai-usage',
          component: () => import('@/features/ai-usage/pages/AiUsagePage.vue'),
          meta: { title: 'AI 用量' },
        },
        {
          path: 'ops',
          name: 'ops',
          component: () => import('@/features/ops/pages/HealthPage.vue'),
          meta: { title: '服务健康' },
        },
        {
          path: 'settings',
          name: 'settings',
          component: () => import('@/features/settings/pages/SettingsPage.vue'),
          meta: { title: '系统设置' },
        },
        {
          path: 'privacy-policy',
          name: 'privacy-policy',
          component: () => import('@/features/docs/pages/PrivacyPolicyPage.vue'),
          meta: { title: '隐私政策' },
        },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  if (!to.meta.public && !getToken()) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  return true
})

export default router

import { createRouter, createWebHistory } from 'vue-router'
import { getToken } from '@/api/client'

const router = createRouter({
  history: createWebHistory('/admin/'),
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
        { path: '', redirect: '/submissions' },
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
          path: 'cases/:id',
          name: 'case-edit',
          component: () => import('@/features/content/pages/CaseEditPage.vue'),
          meta: { title: 'Case 编辑' },
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

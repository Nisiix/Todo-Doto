import { createRouter, createWebHashHistory } from 'vue-router'
import { useWorkspaceStore } from '@/stores/workspace'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'welcome', component: () => import('@/views/WelcomeView.vue') },
    {
      path: '/w',
      component: () => import('@/views/WorkspaceView.vue'),
      children: [
        { path: '', name: 'workspace-home', component: () => import('@/views/WorkspaceHomeView.vue') },
        { path: 'p/:id/:section?', name: 'project', component: () => import('@/views/ProjectView.vue'), props: true },
        { path: 'members', name: 'members', component: () => import('@/views/MembersView.vue') },
        { path: 'drive', name: 'drive', component: () => import('@/views/DriveView.vue') },
        // Pagine riservate agli amministratori (voci di menu visibili solo a loro)
        { path: 'audit', name: 'audit', component: () => import('@/views/AuditView.vue'), meta: { admin: true } },
        { path: 'analytics', name: 'analytics', component: () => import('@/views/AnalyticsView.vue'), meta: { admin: true } },
      ],
    },
  ],
})

router.beforeEach((to) => {
  const ws = useWorkspaceStore()
  if (to.path.startsWith('/w') && ws.status !== 'open') return { name: 'welcome' }
  if (to.meta.admin && !ws.isAdmin) return { name: 'workspace-home' }
  return true
})

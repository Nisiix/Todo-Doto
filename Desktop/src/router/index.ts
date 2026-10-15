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
        { path: 'p/:id', name: 'project', component: () => import('@/views/ProjectView.vue'), props: true },
        { path: 'members', name: 'members', component: () => import('@/views/MembersView.vue') },
        { path: 'drive', name: 'drive', component: () => import('@/views/DriveView.vue') },
        { path: 'audit', name: 'audit', component: () => import('@/views/AuditView.vue') },
        { path: 'timeline', name: 'timeline', component: () => import('@/views/TimelineView.vue') },
      ],
    },
    // Fuori dal layout del workspace: pagina pulita per la stampa / PDF
    { path: '/print/:id', name: 'print', component: () => import('@/views/PrintView.vue'), props: true },
  ],
})

router.beforeEach((to) => {
  const ws = useWorkspaceStore()
  if ((to.path.startsWith('/w') || to.path.startsWith('/print')) && ws.status !== 'open') return { name: 'welcome' }
  return true
})

/**
 * 云枢 CloudPivot 路由表
 * 双端复用同一套路由；移动端底部导航与桌面侧边栏共用此表
 */
import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'
import { startRouteLoading, stopRouteLoading } from '@/utils/routerLoading'

export interface NavItem {
  path: string
  title: string
  icon: string
  /** 桌面侧边栏显示 */
  desktop: boolean
  /** 移动底部 TabBar 显示 */
  mobileTab: boolean
}

/** 导航配置（顺序即展示顺序） */
export const NAV_ITEMS: NavItem[] = [
  { path: '/dashboard', title: '仪表盘', icon: 'Odometer', desktop: true, mobileTab: true },
  { path: '/accounts', title: '账号管理', icon: 'User', desktop: true, mobileTab: true },
  { path: '/dns', title: '域名 DNS', icon: 'Connection', desktop: true, mobileTab: true },
  { path: '/workers', title: 'Workers', icon: 'Cpu', desktop: true, mobileTab: true },
  { path: '/pages', title: 'Pages', icon: 'Files', desktop: true, mobileTab: true },
  { path: '/waf', title: '安全规则', icon: 'Lock', desktop: true, mobileTab: false },
  { path: '/batch', title: '批量任务', icon: 'Operation', desktop: true, mobileTab: false },
  { path: '/logs', title: '日志审计', icon: 'Document', desktop: true, mobileTab: false },
  { path: '/settings', title: '设置', icon: 'Setting', desktop: true, mobileTab: true }
]

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      { path: '', redirect: '/dashboard' },
      {
        path: 'dashboard',
        name: 'dashboard',
        component: () => import('@/pages/dashboard/IndexView.vue'),
        meta: { title: '仪表盘' }
      },
      {
        path: 'accounts',
        name: 'accounts',
        component: () => import('@/pages/account/AccountView.vue'),
        meta: { title: '账号管理' }
      },
      {
        path: 'dns',
        name: 'dns',
        component: () => import('@/pages/dns/DnsView.vue'),
        meta: { title: '域名 DNS' }
      },
      {
        path: 'dns/:zoneId',
        name: 'dns-detail',
        component: () => import('@/pages/dns/DnsView.vue'),
        meta: { title: 'DNS 解析' }
      },
      {
        path: 'workers',
        name: 'workers',
        component: () => import('@/pages/workers/WorkersView.vue'),
        meta: { title: 'Workers 管理' }
      },
      {
        path: 'workers/:script',
        name: 'workers-detail',
        component: () => import('@/pages/workers/WorkersView.vue'),
        meta: { title: 'Worker 详情' }
      },
      {
        path: 'pages',
        name: 'pages',
        component: () => import('@/pages/pages/PagesView.vue'),
        meta: { title: 'Pages 管理' }
      },
      {
        path: 'waf',
        name: 'waf',
        component: () => import('@/pages/waf/WafView.vue'),
        meta: { title: '安全规则' }
      },
      {
        path: 'batch',
        name: 'batch',
        component: () => import('@/pages/batch/BatchView.vue'),
        meta: { title: '批量任务' }
      },
      {
        path: 'logs',
        name: 'logs',
        component: () => import('@/pages/log/LogView.vue'),
        meta: { title: '日志审计' }
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/pages/settings/SettingsView.vue'),
        meta: { title: '设置' }
      }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

router.afterEach((to) => {
  stopRouteLoading()
  const title = to.meta.title as string | undefined
  document.title = title ? `${title} · 云枢 CloudPivot` : '云枢 CloudPivot'
})

router.beforeEach(() => {
  startRouteLoading()
})

router.onError(() => {
  stopRouteLoading()
})

export default router
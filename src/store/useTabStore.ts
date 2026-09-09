import { defineStore } from 'pinia'
import type { RouteLocationNormalizedLoaded } from 'vue-router'
import { NAV_ITEMS } from '@/router'
import type { OpenedTabRecord } from '@/types'
import { getConfig, setConfig } from '@/utils/db'
import { useSettingsStore } from './useSettingsStore'

/** 已打开页签持久化 Key（IndexedDB system_config_table） */
const OPEN_TABS_KEY = 'openTabs'

/** KeepAlive 缓存实例上限（LRU 淘汰） */
export const TAB_CACHE_MAX = 16

/** 固定页签：仪表盘（不可关闭，始终保留） */
const AFFIX_TAB: OpenedTabRecord = {
  fullPath: '/dashboard',
  path: '/dashboard',
  title: '仪表盘',
  affix: true
}

/** 路由首段 -> 页面组件名（KeepAlive include 按组件名匹配） */
const COMPONENT_NAME_BY_PATH: Record<string, string> = {
  '/dashboard': 'DashboardView',
  '/accounts': 'AccountView',
  '/dns': 'DnsView',
  '/workers': 'WorkersView',
  '/pages': 'PagesView',
  '/waf': 'WafView',
  '/batch': 'BatchView',
  '/logs': 'LogView',
  '/settings': 'SettingsView'
}

function componentNameOf(path: string): string | undefined {
  const base = `/${path.split('?')[0].split('/')[1] ?? ''}`
  return COMPONENT_NAME_BY_PATH[base]
}

export function resolveRouteTitle(to: RouteLocationNormalizedLoaded | { path: string; meta?: { title?: unknown } }): string {
  const meta = to.meta?.title
  if (meta) return String(meta)
  const nav = NAV_ITEMS.find((n) => to.path === n.path || to.path.startsWith(`${n.path}/`))
  return nav?.title ?? '页面'
}

export const useTabStore = defineStore('tabs', {
  state: () => ({
    tabs: [] as OpenedTabRecord[],
    restored: false
  }),

  getters: {
    /** 是否开启多页签模式（仅桌面端渲染，移动端恒走单页） */
    enabled(): boolean {
      return useSettingsStore().config.pageMode === 'multi'
    },

    /** 当前已开页签对应的组件名（去重），供 KeepAlive include 精确裁剪缓存 */
    componentNames(): string[] {
      const names = new Set<string>()
      for (const tab of this.tabs) {
        const name = componentNameOf(tab.path)
        if (name) names.add(name)
      }
      return [...names]
    }
  },

  actions: {
    /** 规范化页签列表：去重、补齐字段、保证仪表盘固定页签恒在首位 */
    normalize(list: OpenedTabRecord[]): OpenedTabRecord[] {
      const seen = new Map<string, OpenedTabRecord>()
      for (const item of list) {
        if (!item?.fullPath) continue
        if (item.fullPath === AFFIX_TAB.fullPath) {
          seen.set(AFFIX_TAB.fullPath, { ...AFFIX_TAB })
          continue
        }
        if (!seen.has(item.fullPath)) {
          seen.set(item.fullPath, {
            fullPath: item.fullPath,
            path: item.path || item.fullPath,
            title: item.title || '页面',
            affix: false
          })
        }
      }
      const dashboard = seen.get(AFFIX_TAB.fullPath)
      const rest = [...seen.values()].filter((t) => t.fullPath !== AFFIX_TAB.fullPath)
      return dashboard ? [dashboard, ...rest] : [AFFIX_TAB, ...rest]
    },

    async persist() {
      await setConfig<OpenedTabRecord[]>(OPEN_TABS_KEY, this.tabs)
    },

    /** 启动时读取持久化页签（幂等） */
    async restore() {
      if (this.restored) return
      this.restored = true
      const saved = await getConfig<OpenedTabRecord[]>(OPEN_TABS_KEY, [])
      this.tabs = this.normalize(Array.isArray(saved) ? saved : [])
    },

    /** 进入多页签模式：补全固定页签 */
    async enable() {
      await this.restore()
      if (!this.tabs.some((t) => t.fullPath === AFFIX_TAB.fullPath)) {
        this.tabs.unshift({ ...AFFIX_TAB })
        await this.persist()
      }
    },

    /** 退出多页签模式：清空并清除持久化记录 */
    async disable() {
      this.restored = true
      this.tabs = []
      await setConfig<OpenedTabRecord[]>(OPEN_TABS_KEY, [])
    },

    /** 路由变化后调用：确保当前页面已作为页签打开 */
    async syncRoute(to: RouteLocationNormalizedLoaded) {
      if (!this.enabled) return
      await this.enable()
      if (!this.tabs.some((t) => t.fullPath === to.fullPath)) {
        this.tabs.push({
          fullPath: to.fullPath,
          path: to.path,
          title: resolveRouteTitle(to),
          affix: false
        })
        await this.persist()
      }
    },

    /** 更新页签标题（详情页展示具体资源名时调用） */
    async updateTitle(fullPath: string, title: string) {
      if (!this.enabled || !title) return
      const tab = this.tabs.find((t) => t.fullPath === fullPath)
      if (tab && tab.title !== title) {
        tab.title = title
        await this.persist()
      }
    },

    /**
     * 关闭指定页签；返回关闭后应当激活的后一个页签（关闭的是活动页时由调用方跳转）。
     * 固定页签不允许关闭，返回 null。
     */
    async closeTab(fullPath: string): Promise<OpenedTabRecord | null> {
      const index = this.tabs.findIndex((t) => t.fullPath === fullPath)
      if (index < 0 || this.tabs[index].affix) return null
      this.tabs.splice(index, 1)
      await this.persist()
      return this.tabs[index] ?? this.tabs[index - 1] ?? this.tabs[0] ?? null
    },

    /** 关闭其它页签（固定页签始终保留） */
    async closeOthers(fullPath: string) {
      this.tabs = this.tabs.filter((t) => t.affix || t.fullPath === fullPath)
      await this.persist()
    },

    /** 仅保留固定页签 */
    async closeAll() {
      this.tabs = this.tabs.filter((t) => t.affix)
      await this.persist()
    }
  }
})

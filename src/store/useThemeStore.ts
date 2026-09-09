/**
 * 主题状态管理
 *
 * 模式：system（跟随系统，默认）/ light / dark
 * - 通过修改 HTML 根节点 class 切换 `theme-light` / `theme-dark`
 * - system 模式监听系统配色偏好并即时响应
 * - Electron 主进程同步原生窗口外观（setNativeTheme）
 * - 持久化：IndexedDB system_config_table（含 localStorage 快速缓存防闪烁）
 */
import { defineStore } from 'pinia'
import { getConfig, setConfig } from '@/utils/db'
import { isElectron } from '@/utils/platform'
import type { ResolvedTheme, ThemeMode } from '@/types'

const THEME_MODE_KEY = 'themeMode'
const STORAGE_CACHE_KEY = 'cloudpivot-theme-mode'

/** 读取系统偏好（跟随系统时使用） */
function systemPrefersDark(): boolean {
  return (
    typeof window !== 'undefined' &&
    !!window.matchMedia &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  )
}

export const useThemeStore = defineStore('theme', {
  state: () => ({
    mode: 'system' as ThemeMode,
    /** 当前实际生效外观 */
    resolved: 'light' as ResolvedTheme,
    initialized: false
  }),

  getters: {
    /** 是否深色 */
    isDark: (state) => state.resolved === 'dark',
    /** 描述文案 */
    modeLabel: (state) => {
      const map: Record<ThemeMode, string> = {
        system: '跟随系统',
        light: '浅色模式',
        dark: '深色模式'
      }
      return map[state.mode]
    }
  },

  actions: {
    /** 计算 mode 下应生效的外观 */
    resolve(mode: ThemeMode): ResolvedTheme {
      if (mode === 'light') return 'light'
      if (mode === 'dark') return 'dark'
      return systemPrefersDark() ? 'dark' : 'light'
    },

    /** 应用主题到根节点 */
    apply(theme: ResolvedTheme) {
      this.resolved = theme
      const root = document.documentElement
      root.classList.remove('theme-light', 'theme-dark')
      // Element Plus 暗色变量仅在其官方 `html.dark` 选择器下生效，需同步挂载
      root.classList.toggle('dark', theme === 'dark')
      root.classList.add(theme === 'dark' ? 'theme-dark' : 'theme-light')
      root.style.colorScheme = theme

      // 同步原生端外观
      if (isElectron && window.cloudpivot) {
        window.cloudpivot.setNativeTheme(theme)
      }

      // 同步 meta theme-color
      const meta = document.querySelector('meta[name="theme-color"]')
      meta?.setAttribute('content', theme === 'dark' ? '#111827' : '#22C55E')
    },

    async setMode(mode: ThemeMode) {
      if (this.mode !== mode) {
        this.mode = mode
      }
      this.apply(this.resolve(mode))
      try {
        await setConfig(THEME_MODE_KEY, mode)
        localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(mode))
      } catch {
        /* 写入失败不影响本次切换 */
      }
    },

    /** 初始化：读取配置 + 绑定系统监听 */
    async init() {
      if (this.initialized) return
      this.initialized = true

      const saved = await getConfig<ThemeMode>(THEME_MODE_KEY, 'system')
      this.mode = saved
      this.apply(this.resolve(saved))

      // 跟随系统：监听系统外观变化
      if (typeof window !== 'undefined' && window.matchMedia) {
        const media = window.matchMedia('(prefers-color-scheme: dark)')
        const handler = () => {
          if (this.mode === 'system') this.apply(this.resolve('system'))
        }
        if (typeof media.addEventListener === 'function') {
          media.addEventListener('change', handler)
        } else {
          ;(media as MediaQueryList).addListener(handler)
        }
      }
    }
  }
})
/**
 * 应用入口：初始化主题 / 设置 / 账号 / 定时同步 / 巡检
 */
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'

import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import 'vant/lib/index.css'

import '@/assets/styles/index.scss'

import App from './App.vue'
import router from './router'

import { registerMasterKeyStorage } from '@/utils/crypto'
import { masterKeyStorage } from '@/utils/db'
import { useThemeStore } from '@/store/useThemeStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useAccountStore } from '@/store/useAccountStore'
import { startAutoSync, rebuildAutoSync } from '@/utils/syncService'
import { runInspection, startInspectionLoop } from '@/utils/inspectionService'
import { initViewportWatch } from '@/utils/platform'

// 注入主密钥存储通道（IndexedDB）
registerMasterKeyStorage(masterKeyStorage)

async function bootstrap() {
  const app = createApp(App)
  const pinia = createPinia()
  app.use(pinia)
  app.use(router)
  app.use(ElementPlus, { locale: zhCn })

  // 注册 Element Plus 图标（全局）
  for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
    app.component(key, component)
  }

  initViewportWatch()

  app.mount('#app')

  // 初始化各状态模块（异步，不阻塞首帧渲染）
  const themeStore = useThemeStore(pinia)
  const settingsStore = useSettingsStore(pinia)
  const accountStore = useAccountStore(pinia)

  try {
    await Promise.all([themeStore.init(), settingsStore.init()])
  } catch (error) {
    console.error('[CloudPivot] 初始化失败', error)
  }

  // 主题初始化后重建定时同步（依赖设置）
  rebuildAutoSync()

  try {
    await accountStore.load()
    // 首次进入自动做一轮巡检
    void runInspection()
  } catch (error) {
    console.error('[CloudPivot] 账号加载失败', error)
  }

  // 周期性巡检（随设置启停）
  const inspectionTimer = startInspectionLoop(settingsStore.config.inspectionIntervalMinutes)
  // 设置变更时重建
  settingsStore.$subscribe((mutation) => {
    void mutation
    rebuildAutoSync()
  })

  // 全局异常兜底：禁止密钥明文进入日志
  window.addEventListener('unhandledrejection', (event) => {
    const message = String((event.reason as Error)?.message ?? event.reason ?? '')
    if (message) console.warn('[CloudPivot] unhandled:', message)
  })

  void inspectionTimer
}

void bootstrap()
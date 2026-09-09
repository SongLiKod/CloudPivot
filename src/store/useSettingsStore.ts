/**
 * 系统设置状态管理
 *
 * 配置项（需求模块11 + 技术文档 §3.4 system_config_table）：
 *  - 外观主题（由 useThemeStore 管理，此处持久化引用）
 *  - 数据同步周期：1/5/10/30 分钟
 *  - Windows 自定义备份路径
 *  - 日志保留时长
 */
import { defineStore } from 'pinia'
import type { SyncIntervalMinutes, SystemConfig } from '@/types'
import { getConfig, setConfig } from '@/utils/db'
import { configureClient } from '@/api/client'
import { globalGate } from '@/utils/scheduler'

const CONFIG_KEY = 'systemConfig'

export const DEFAULT_CONFIG: SystemConfig = {
  themeMode: 'system',
  syncInterval: 10,
  autoSyncEnabled: true,
  backupPath: '',
  logRetentionDays: 90,
  concurrencyLimit: 4,
  requestTimeout: 20,
  retryTimes: 2,
  inspectionEnabled: true,
  inspectionIntervalMinutes: 30,
  showRowIndex: false
}

export const SYNC_INTERVAL_OPTIONS: SyncIntervalMinutes[] = [1, 5, 10, 30]

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    config: { ...DEFAULT_CONFIG } as SystemConfig,
    initialized: false
  }),

  getters: {
    syncIntervalLabel(): string {
      return `${this.config.syncInterval} 分钟`
    }
  },

  actions: {
    async init() {
      if (this.initialized) return
      this.initialized = true
      const saved = await getConfig<SystemConfig>(CONFIG_KEY, DEFAULT_CONFIG)
      this.config = { ...DEFAULT_CONFIG, ...saved }
      this.applyRuntime()
    },

    async update(patch: Partial<SystemConfig>) {
      this.config = { ...this.config, ...patch }
      await setConfig(CONFIG_KEY, this.config)
      this.applyRuntime()
    },

    async updateSyncInterval(interval: SyncIntervalMinutes) {
      await this.update({ syncInterval: interval })
    },

    /** 将影响运行时的配置应用到全局模块 */
    applyRuntime() {
      configureClient({
        timeout: this.config.requestTimeout * 1000,
        retries: this.config.retryTimes
      })
      globalGate.setLimit(this.config.concurrencyLimit)
    }
  }
})
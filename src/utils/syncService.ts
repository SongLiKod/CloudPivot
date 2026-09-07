/**
 * 定时同步服务（需求模块1-4 + Android 后台保活降级）
 *
 * - 1/5/10/30 分钟周期刷新全部账号资源
 * - 单实例定时器，监听设置变化自动重建
 * - Android / 浏览器环境下使用 setInterval + 页面可见性优化
 */
import { useSettingsStore } from '@/store/useSettingsStore'
import { useAccountStore } from '@/store/useAccountStore'
import { isLocked } from '@/utils/lockService'

let timer: ReturnType<typeof setInterval> | null = null
let lastRunAt = 0

/** 执行一轮全量同步（带最小间隔防冲击） */
export async function runAutoSync(force = false): Promise<void> {
  if (isLocked()) return
  const now = Date.now()
  if (!force && now - lastRunAt < 5_000) return
  const settings = useSettingsStore()
  if (!settings.config.autoSyncEnabled) return

  lastRunAt = now
  const accountStore = useAccountStore()
  if (!accountStore.loaded) return
  await accountStore.refreshAll()
}

/** 启动定时同步（幂等） */
export function startAutoSync(): void {
  stopAutoSync()
  const settings = useSettingsStore()
  if (!settings.config.autoSyncEnabled) return

  const interval = Math.max(1, settings.config.syncInterval) * 60_000
  timer = setInterval(() => {
    // 后台不可见时跳过（原生端由系统后台任务接管）
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    void runAutoSync()
  }, interval)

  // 绑定额外安全兜底：即使单次同步异常也不退出
  timer.unref?.()
}

/** 停止定时同步 */
export function stopAutoSync(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** 设置变更后重建定时器 */
export function rebuildAutoSync(): void {
  startAutoSync()
}
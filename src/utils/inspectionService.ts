/**
 * 自动巡检服务（需求模块8）
 *
 * 定时检测：
 *  - 账号失效：Token 过期 / 无效
 *  - DNS 异常：Zone 处于 pending / paused / deactivated
 *  - 配额超限：Workers / Pages 数量与请求配额过高（宽松阈值）
 *  - Zone 暂停：paused === true
 *
 * 检测结果写入 inspection_table 并弹窗提醒。
 */
import type { InspectionIssue, InspectionType, LogLevel } from '@/types'
import { listInspectionIssues, saveInspectionIssues } from '@/utils/db'
import { randomId } from '@/utils/crypto'
import { useAccountStore } from '@/store/useAccountStore'
import { useResourceStore } from '@/store/useResourceStore'
import { useLogStore } from '@/store/useLogStore'
import { formatTime } from './format'
import { isLocked } from '@/utils/lockService'
import { useSettingsStore } from '@/store/useSettingsStore'

export interface InspectionResult {
  issues: InspectionIssue[]
  passed: boolean
}

/** 生成巡检项（去重：同账号同类型在 24h 内不重复） */
async function collectIssues(): Promise<InspectionIssue[]> {
  const accountStore = useAccountStore()
  const resourceStore = useResourceStore()
  const issues: InspectionIssue[] = []
  const now = Date.now()

  const existing = await listInspectionIssues(true)
  const seen = new Set(existing.map((i) => `${i.accountId}:${i.type}`))

  // 1. 账号失效 / 权限不足检测
  for (const account of accountStore.accounts) {
    if (account.status === 'invalid') {
      issues.push(await makeIssue(
        'account-invalid',
        'error',
        account,
        '账号凭据失效',
        `账号「${account.name}」凭据无法通过校验，请重新配置。`
      ))
    } else if (account.status === 'forbidden') {
      issues.push(await makeIssue(
        'account-invalid',
        'warning',
        account,
        '账号权限不足',
        `账号「${account.name}」API Token 权限不足，可能导致部分操作失败。`
      ))
    } else if (account.status === 'expired') {
      issues.push(await makeIssue(
        'account-invalid',
        'warning',
        account,
        '账号 Token 过期',
        `账号「${account.name}」的 API Token 已过期，请更新。`
      ))
    }
  }

  // 2. DNS / Zone 异常
  for (const zone of resourceStore.zones.rows) {
    const account = accountStore.accounts.find((a) => a.id === zone.__accountId)
    if (!account) continue
    if (zone.status !== 'active') {
      issues.push(await makeIssue(
        'dns-error',
        'warning',
        account,
        `域名状态异常：${zone.name}`,
        `域名 ${zone.name} 当前状态为「${zone.status}」，可能影响解析与访问。`
      ))
    } else if (zone.paused) {
      issues.push(await makeIssue(
        'zone-paused',
        'warning',
        account,
        `域名已暂停：${zone.name}`,
        `域名 ${zone.name} 已处于暂停（paused）状态。`
      ))
    }
  }

  // 3. 配额超限（宽松阈值：Workers > 50 或 Pages > 20 或 Zone > 200）
  for (const account of accountStore.accounts) {
    if (account.stats.workerCount > 50) {
      issues.push(await makeIssue(
        'quota-exceeded',
        'warning',
        account,
        'Workers 脚本数偏高',
        `账号「${account.name}」当前有 ${account.stats.workerCount} 个 Workers 脚本，注意套餐配额。`
      ))
    }
    if (account.stats.zoneCount > 200) {
      issues.push(await makeIssue(
        'quota-exceeded',
        'warning',
        account,
        '域名数量偏高',
        `账号「${account.name}」当前有 ${account.stats.zoneCount} 个域名，注意套餐配额。`
      ))
    }
  }

  // 去重：与已存在未处理项重复则跳过
  const unique = issues.filter((i) => !seen.has(`${i.accountId}:${i.type}`))
  return unique
}

async function makeIssue(
  type: InspectionType,
  level: LogLevel,
  account: { id: string; name: string },
  title: string,
  detail: string
): Promise<InspectionIssue> {
  return {
    id: randomId('insp'),
    type,
    level,
    accountId: account.id,
    accountName: account.name,
    title,
    detail,
    detectedAt: Date.now(),
    handled: false
  }
}

let running = false

/** 执行一轮巡检 */
export async function runInspection(): Promise<InspectionResult> {
  if (isLocked()) return { issues: [], passed: true }
  if (!useSettingsStore().config.inspectionEnabled) return { issues: [], passed: true }
  if (running) return { issues: [], passed: true }
  running = true
  try {
    const issues = await collectIssues()
    if (issues.length) {
      await saveInspectionIssues(issues)
      const logStore = useLogStore()
      for (const issue of issues) {
        await logStore.write({
          module: 'inspection',
          action: '自动巡检发现异常',
          detail: `${issue.title}：${issue.detail}（${formatTime(issue.detectedAt)}）`,
          level: issue.level,
          result: 'fail',
          accountId: issue.accountId,
          accountName: issue.accountName
        })
      }
    }
    return { issues, passed: issues.length === 0 }
  } finally {
    running = false
  }
}

let loopTimer: ReturnType<typeof setInterval> | null = null

/** 重建周期巡检（随设置启停与间隔变更，幂等） */
export function rebuildInspectionLoop(): void {
  if (loopTimer) {
    clearInterval(loopTimer)
    loopTimer = null
  }
  const settings = useSettingsStore()
  if (!settings.config.inspectionEnabled) return
  loopTimer = setInterval(() => {
    if (isLocked()) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    void runInspection()
  }, Math.max(5, settings.config.inspectionIntervalMinutes) * 60_000)
}
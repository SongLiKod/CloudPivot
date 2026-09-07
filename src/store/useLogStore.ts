/**
 * 操作日志审计状态管理
 *
 * - 全量操作留痕：时间、目标账号、操作内容、执行结果（需求模块9）
 * - 日志防篡改哈希链：prevHash -> hash
 * - 定期按保留时长清理
 */
import { defineStore } from 'pinia'
import type { LogLevel, OperationLog } from '@/types'
import {
  appendOperationLogs,
  getLatestOperationLog,
  pruneOperationLogs,
  queryOperationLogs,
  verifyLogChain
} from '@/utils/db'
import { randomId, sha256Hex } from '@/utils/crypto'

export interface LogQuery {
  from?: number
  to?: number
  level?: string
  module?: string
  accountId?: string
  keyword?: string
  page: number
  pageSize: number
}

const LOG_CHAIN_GENESIS = 'GENESIS'

export const useLogStore = defineStore('log', {
  state: () => ({
    rows: [] as OperationLog[],
    total: 0,
    loading: false,
    /** 日志链是否完整（校验不通过时告警） */
    chainValid: true
  }),

  actions: {
    /** 写入一条操作日志（自动接续哈希链） */
    async write(entry: {
      module: string
      action: string
      detail: string
      level?: LogLevel
      result?: 'success' | 'fail'
      accountId?: string
      accountName?: string
      error?: string
    }): Promise<OperationLog> {
      const level = entry.level ?? (entry.result === 'fail' ? 'error' : 'info')
      const last = await getLatestOperationLog()
      const prevHash = last?.hash ?? LOG_CHAIN_GENESIS
      const payload = JSON.stringify({
        module: entry.module,
        action: entry.action,
        detail: entry.detail,
        time: Date.now()
      })
      const hash = await sha256Hex(`${prevHash}::${payload}`)

      const log: OperationLog = {
        id: randomId('log'),
        time: Date.now(),
        level,
        module: entry.module,
        action: entry.action,
        detail: entry.detail,
        accountId: entry.accountId,
        accountName: entry.accountName,
        result: entry.result ?? 'success',
        error: entry.error,
        hash,
        prevHash
      }
      await appendOperationLogs([log])
      return log
    },

    /** 批量写入（备份还原场景） */
    async writeMany(logs: OperationLog[]) {
      if (!logs.length) return
      await appendOperationLogs(logs)
    },

    /** 分页查询 */
    async query(query: Partial<LogQuery> = {}) {
      this.loading = true
      try {
        const page = query.page ?? 1
        const pageSize = query.pageSize ?? 50
        const { rows, total } = await queryOperationLogs({
          ...query,
          offset: (page - 1) * pageSize,
          limit: pageSize
        })
        this.rows = rows
        this.total = total
      } finally {
        this.loading = false
      }
    },

    /** 校验日志链完整性 */
    async checkChain() {
      const result = await verifyLogChain()
      this.chainValid = result.valid
      return result
    },

    /** 按保留时长清理 */
    async prune(retentionDays: number) {
      return pruneOperationLogs(retentionDays)
    },

    /** 清理并重校验 */
    async pruneAndVerify(retentionDays: number) {
      await this.prune(retentionDays)
      await this.checkChain()
    }
  }
})
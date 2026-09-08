/**
 * 资源缓存状态管理
 *
 * 聚合全部账号的域名 / DNS / Workers / Pages / WAF 数据，
 * 支持离线查看（IndexedDB 缓存）与关键词检索。
 */
import { defineStore } from 'pinia'
import type {
  CfAccessRule,
  CfDnsRecord,
  CfPagesProject,
  CfWorkerRoute,
  CfWorkerScript,
  CfZone,
  CloudflareAccount,
  ResourceKind
} from '@/types'
import { readAllCacheByKind, writeCache } from '@/utils/db'
import { buildRequestContext } from './credentialService'
import * as zonesApi from '@/api/zones'
import * as dnsApi from '@/api/dns'
import * as workersApi from '@/api/workers'
import * as pagesApi from '@/api/pages'
import * as wafApi from '@/api/waf'
import { useAccountStore } from './useAccountStore'
import { runWithConcurrency } from '@/utils/scheduler'

export interface ResourceState<T> {
  /** 是否已加载（含缓存） */
  loaded: boolean
  loading: boolean
  /** 是否使用离线缓存 */
  offline: boolean
  rows: T[]
  cachedAt?: number
  error?: string
}

const emptyState = <T,>(): ResourceState<T> => ({
  loaded: false,
  loading: false,
  offline: false,
  rows: []
})

export const useResourceStore = defineStore('resource', {
  state: () => ({
    zones: emptyState<CfZone>(),
    dns: emptyState<CfDnsRecord>(),
    workers: emptyState<CfWorkerScript>(),
    workerRoutes: emptyState<CfWorkerRoute>(),
    pages: emptyState<CfPagesProject>(),
    waf: emptyState<CfAccessRule & { __zoneId?: string; __zoneName?: string }>()
  }),

  getters: {
    zonedCount(state) {
      return state.zones.rows.length
    }
  },

  actions: {
    /** 账号刷新后由 account store 回调更新聚合数据 */
    _restoreFromAccount(
      accountId: string,
      account: CloudflareAccount,
      zones: CfZone[],
      workers: CfWorkerScript[],
      pages: CfPagesProject[]
    ) {
      const stamp = <T extends { __accountId?: string }>(rows: T[]): Array<T & { __accountId: string }> =>
        rows.map((r) => ({ ...r, __accountId: accountId }))

      const mergeRows = <T>(existing: T[], incoming: T[], key: (row: T) => string): T[] => {
        const incomingIds = new Set(incoming.map(key))
        const kept = existing.filter((row) => {
          const id = key(row)
          return !((row as { __accountId?: string }).__accountId === accountId && incomingIds.has(id))
        })
        return [...kept, ...incoming]
      }

      this.zones.rows = mergeRows(this.zones.rows, stamp(zones), (z: CfZone) => z.id)
      this.workers.rows = mergeRows(
        this.workers.rows,
        workers.map((w) => ({ ...w, __accountId: accountId })),
        (w) => `${w.__accountId}/${w.id}`
      )
      this.pages.rows = mergeRows(
        this.pages.rows,
        pages.map((p) => ({ ...p, __accountId: accountId })),
        (p) => `${p.__accountId}/${p.name}`
      )
      this.zones.loaded = true
      this.workers.loaded = true
      this.pages.loaded = true
      void account
    },

    /* ------------------------------------------------------------ */
    /* 加载（先缓存后网络）                                          */
    /* ------------------------------------------------------------ */

    async loadZones(force = false) {
      if (this.zones.loaded && !force) return
      this.zones.loading = true
      try {
        // 先读缓存
        const cached = await readAllCacheByKind<CfZone[]>('zone')
        if (cached.length) {
          this.zones.rows = cached.flatMap((c) =>
            c.data.map((z) => ({ ...z, __accountId: c.accountId }))
          )
          this.zones.cachedAt = Math.max(...cached.map((c) => c.cachedAt))
          this.zones.offline = true
          this.zones.loaded = true
        }

        const accountStore = useAccountStore()
        const zoneResults = await runWithConcurrency(accountStore.accounts, 4, async (account) => {
          if (!(await this.hasLiveToken())) return
          const ctx = await buildRequestContext(account)
          const zones = await zonesApi.listZones(ctx)
          const stamped = zones.map((z) => ({ ...z, __accountId: account.id }))
          this.zones.rows = [
            ...this.zones.rows.filter((r) => r.__accountId !== account.id),
            ...stamped
          ]
          await writeCache(account.id, 'zone', 'all', zones)
          await accountStore.updateStats(account.id, { zoneCount: zones.length })
        })
        const zoneFailures = zoneResults
          .filter((r) => r.status === 'rejected')
          .map((r) => (r as PromiseRejectedResult).reason as Error)
        if (zoneFailures.length) {
          const uniqueErrors = [...new Set(zoneFailures.map((e) => e.message))]
          this.zones.error = uniqueErrors.join('；')
        } else {
          this.zones.error = undefined
        }
        this.zones.offline = zoneResults.length > 0 && zoneFailures.length === zoneResults.length
        this.zones.loaded = true
      } catch (error) {
        this.zones.error = (error as Error).message
      } finally {
        this.zones.loading = false
      }
    },

    /** 简化占位：Token 存活由 accountStore 状态保证，直接返回 true */
    async hasLiveToken(): Promise<boolean> {
      return true
    },

    /* ------------------------------------------------------------ */
    /* DNS 记录（按 zone 拉取并聚合）                                */
    /* ------------------------------------------------------------ */

    async loadDns(zoneIds: string[] = [], force = false) {
      if (this.dns.loaded && !force && !zoneIds.length) return
      this.dns.loading = true
      try {
        const accountStore = useAccountStore()

        // 无指定 zone 时，从缓存加载全部 DNS（补回账号归属，避免离线时无法归类）
        if (!zoneIds.length) {
          const cached = await readAllCacheByKind<CfDnsRecord[]>('dns')
          if (cached.length) {
            this.dns.rows = cached.flatMap((c) =>
              c.data.map((r) => ({
                ...r,
                __accountId: c.accountId,
                __zoneName: (() => {
                  const z = this.zones.rows.find((zz) => zz.id === r.zone_id)
                  return z?.name ?? ''
                })()
              }))
            )
            this.dns.cachedAt = Math.max(...cached.map((c) => c.cachedAt))
            this.dns.offline = true
            this.dns.loaded = true
          }
          // 收集所有 zone
          zoneIds = this.zones.rows.map((z) => z.id)
        }

        if (zoneIds.length) {
          const zoneByAccount = new Map<string, string[]>()
          for (const row of this.zones.rows) {
            if (zoneIds.includes(row.id)) {
              // 兼容历史脏数据 / 缓存行：__accountId 可能缺失或为 Cloudflare account_id
              const account =
                accountStore.resolveAccount(row.__accountId) ??
                accountStore.resolveAccount(row.account?.id)
              if (!account) continue
              const list = zoneByAccount.get(account.id) ?? []
              list.push(row.id)
              zoneByAccount.set(account.id, list)
            }
          }

          const results = await runWithConcurrency([...zoneByAccount.entries()], 3, async ([accountId, zids]) => {
            const account = accountStore.resolveAccount(accountId) ?? accountStore.accounts.find((a) => a.id === accountId)
            if (!account) return
            const ctx = await buildRequestContext(account)
            for (const zoneId of zids) {
              const records = await dnsApi.listDnsRecords(ctx, zoneId)
              const stamped = records.map((r) => ({
                ...r,
                // 部分接口/缓存可能缺少 zone_id，统一以请求的 zone 为准
                zone_id: r.zone_id ?? zoneId,
                __accountId: account.id,
                __zoneName: (() => {
                  const z = this.zones.rows.find((zz) => zz.id === zoneId)
                  return z?.name ?? ''
                })()
              }))
              this.dns.rows = [
                ...this.dns.rows.filter(
                  (r) => !(r.__accountId === account.id && r.zone_id === zoneId)
                ),
                ...stamped
              ]
              await writeCache(account.id, 'dns', zoneId, records)
            }
          })

          // 暴露拉取失败的真实原因（便于定位权限 / 接口问题）
          const failures = results
            .filter((r) => r.status === 'rejected')
            .map((r) => (r as PromiseRejectedResult).reason as Error)
          if (failures.length) {
            const uniqueErrors = [...new Set(failures.map((e) => e.message))]
            this.dns.error = uniqueErrors.join('；')
          } else {
            this.dns.error = undefined
          }
          this.dns.offline = results.length > 0 && failures.length === results.length
        }
        this.dns.loaded = true
      } catch (error) {
        this.dns.error = (error as Error).message
      } finally {
        this.dns.loading = false
      }
    },

    /* ------------------------------------------------------------ */
    /* Workers 脚本 / 路由 / Pages / WAF 占位（由页面按需调用）      */
    /* ------------------------------------------------------------ */

    async loadWorkers(force = false) {
      if (this.workers.loaded && !force) return
      this.workers.loading = true
      try {
        const accountStore = useAccountStore()
        const results = await runWithConcurrency(
          accountStore.accounts.filter((a) => a.status === 'active'),
          4,
          async (account) => {
            // 未回填 Cloudflare 账号 ID 前无法请求，跳过（可先在账号管理「拉取资源」）
            if (!account.cfAccountId) return { accountId: account.id, scripts: [] }
            const ctx = await buildRequestContext(account)
            const scripts = await workersApi.listWorkerScripts(ctx, account.cfAccountId)
            return {
              accountId: account.id,
              scripts: scripts.map((s) => ({ ...s, __accountId: account.id }))
            }
          }
        )
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { accountId, scripts } = result.value
            this.workers.rows = [
              ...this.workers.rows.filter((r) => r.__accountId !== accountId),
              ...scripts
            ]
          }
        }
        this.workers.offline = false
        this.workers.loaded = true
      } catch (error) {
        this.workers.error = (error as Error).message
      } finally {
        this.workers.loading = false
      }
    },

    async loadPages(force = false) {
      if (this.pages.loaded && !force) return
      this.pages.loading = true
      try {
        const accountStore = useAccountStore()
        const results = await runWithConcurrency(
          accountStore.accounts.filter((a) => a.status === 'active'),
          4,
          async (account) => {
            // 未回填 Cloudflare 账号 ID 前无法请求，跳过
            if (!account.cfAccountId) return { accountId: account.id, projects: [] }
            const ctx = await buildRequestContext(account)
            const projects = await pagesApi.listPagesProjects(ctx, account.cfAccountId)
            return {
              accountId: account.id,
              projects: projects.map((p) => ({ ...p, __accountId: account.id }))
            }
          }
        )
        for (const result of results) {
          if (result.status === 'fulfilled') {
            const { accountId, projects } = result.value
            this.pages.rows = [
              ...this.pages.rows.filter((r) => r.__accountId !== accountId),
              ...projects
            ]
          }
        }
        this.pages.offline = false
        this.pages.loaded = true
      } catch (error) {
        this.pages.error = (error as Error).message
      } finally {
        this.pages.loading = false
      }
    },

    /** 加载 WAF 规则（每 zone 取访问规则 + 速率限制） */
    async loadWaf(force = false) {
      if (this.waf.loaded && !force) return
      this.waf.loading = true
      try {
        const accountStore = useAccountStore()
        const zoneRows = this.zones.rows.filter((z) => z.status === 'active' && !z.paused)
        const results = await runWithConcurrency(zoneRows.slice(0, 30), 3, async (zone) => {
          const account =
            accountStore.resolveAccount(zone.__accountId) ??
            accountStore.resolveAccount(zone.account?.id)
          if (!account) return null
          const ctx = await buildRequestContext(account)
          const rules = await wafApi.listAccessRules(ctx, zone.id)
          return rules.map((r) => ({
            ...r,
            __accountId: zone.__accountId,
            __zoneId: zone.id,
            __zoneName: zone.name
          }))
        })
        const rows: CfAccessRule[] = results
          .filter((r) => r.status === 'fulfilled' && !!r.value)
          .flatMap((r) => {
            const v = (r as PromiseFulfilledResult<CfAccessRule[] | null>).value
            return v ?? []
          })
        this.waf.rows = rows
        this.waf.offline = false
        this.waf.loaded = true
      } catch (error) {
        this.waf.error = (error as Error).message
      } finally {
        this.waf.loading = false
      }
    },

    /** 清空某账号资源 */
    async clearAccountRows(accountId: string) {
      const filter = <T extends { __accountId?: string }>(rows: T[]) =>
        rows.filter((r) => r.__accountId !== accountId)
      this.zones.rows = filter(this.zones.rows)
      this.dns.rows = filter(this.dns.rows)
      this.workers.rows = filter(this.workers.rows)
      this.workerRoutes.rows = filter(this.workerRoutes.rows)
      this.pages.rows = filter(this.pages.rows)
      this.waf.rows = filter(this.waf.rows)
      const db = await import('@/utils/db')
      await db.deleteAccountCache(accountId)
    },

    /** 重置全部资源聚合状态（清空内存行，配合本地缓存清除后重新同步） */
    resetAll() {
      this.zones = emptyState<CfZone>()
      this.dns = emptyState<CfDnsRecord>()
      this.workers = emptyState<CfWorkerScript>()
      this.workerRoutes = emptyState<CfWorkerRoute>()
      this.pages = emptyState<CfPagesProject>()
      this.waf = emptyState<CfAccessRule & { __zoneId?: string; __zoneName?: string }>()
    }
  }
})
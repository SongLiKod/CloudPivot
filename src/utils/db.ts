/**
 * IndexedDB 本地存储层
 *
 * 数据表设计（技术文档 §3.4）：
 *  - account_table        账号信息（密钥仅存密文）
 *  - account_group_table  账号分组
 *  - resource_cache       域名 / Workers / Pages / WAF 资源缓存（支持离线查看）
 *  - task_log_table       批量任务执行日志
 *  - operation_log_table  全量操作审计日志（哈希链防篡改）
 *  - system_config_table  系统配置（主题模式、同步周期、主密钥等）
 *  - dns_template_table   DNS 配置模板
 *  - inspection_table     自动巡检异常记录
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { resetMasterKeySession, sha256Hex } from '@/utils/crypto'
import type {
  AccountGroup,
  BatchTask,
  CloudflareAccount,
  DnsTemplate,
  EncryptedPayload,
  InspectionIssue,
  OperationLog,
  ResourceCacheRecord,
  SystemConfig
} from '@/types'

const DB_NAME = 'cloudpivot'
const DB_VERSION = 1

interface CloudPivotDB extends DBSchema {
  account_table: {
    key: string
    value: CloudflareAccount
    indexes: {
      'by-group': string
      'by-status': string
      'by-sort': number
    }
  }
  account_group_table: {
    key: string
    value: AccountGroup
    indexes: { 'by-sort': number }
  }
  resource_cache: {
    key: string
    value: ResourceCacheRecord
    indexes: {
      'by-account': string
      'by-kind': string
      'by-cachedAt': number
    }
  }
  task_log_table: {
    key: string
    value: BatchTask
    indexes: {
      'by-type': string
      'by-status': string
      'by-createdAt': number
    }
  }
  operation_log_table: {
    key: string
    value: OperationLog
    indexes: {
      'by-time': number
      'by-level': string
      'by-module': string
      'by-account': string
    }
  }
  system_config_table: {
    key: string
    value: { key: string; value: unknown; updatedAt: number }
  }
  dns_template_table: {
    key: string
    value: DnsTemplate
    indexes: { 'by-createdAt': number }
  }
  inspection_table: {
    key: string
    value: InspectionIssue
    indexes: {
      'by-detectedAt': number
      'by-type': string
      'by-handled': number
    }
  }
}

export const STORE = {
  account: 'account_table',
  group: 'account_group_table',
  cache: 'resource_cache',
  task: 'task_log_table',
  opLog: 'operation_log_table',
  config: 'system_config_table',
  template: 'dns_template_table',
  inspection: 'inspection_table'
} as const

let dbPromise: Promise<IDBPDatabase<CloudPivotDB>> | null = null

export function getDB(): Promise<IDBPDatabase<CloudPivotDB>> {
  if (!dbPromise) {
    dbPromise = openDB<CloudPivotDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE.account)) {
          const accountStore = db.createObjectStore(STORE.account, { keyPath: 'id' })
          accountStore.createIndex('by-group', 'groupId')
          accountStore.createIndex('by-status', 'status')
          accountStore.createIndex('by-sort', 'sortOrder')
        }
        if (!db.objectStoreNames.contains(STORE.group)) {
          const groupStore = db.createObjectStore(STORE.group, { keyPath: 'id' })
          groupStore.createIndex('by-sort', 'sortOrder')
        }
        if (!db.objectStoreNames.contains(STORE.cache)) {
          const cacheStore = db.createObjectStore(STORE.cache, { keyPath: 'key' })
          cacheStore.createIndex('by-account', 'accountId')
          cacheStore.createIndex('by-kind', 'kind')
          cacheStore.createIndex('by-cachedAt', 'cachedAt')
        }
        if (!db.objectStoreNames.contains(STORE.task)) {
          const taskStore = db.createObjectStore(STORE.task, { keyPath: 'id' })
          taskStore.createIndex('by-type', 'type')
          taskStore.createIndex('by-status', 'status')
          taskStore.createIndex('by-createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains(STORE.opLog)) {
          const logStore = db.createObjectStore(STORE.opLog, { keyPath: 'id' })
          logStore.createIndex('by-time', 'time')
          logStore.createIndex('by-level', 'level')
          logStore.createIndex('by-module', 'module')
          logStore.createIndex('by-account', 'accountId')
        }
        if (!db.objectStoreNames.contains(STORE.config)) {
          db.createObjectStore(STORE.config, { keyPath: 'key' })
        }
        if (!db.objectStoreNames.contains(STORE.template)) {
          const tplStore = db.createObjectStore(STORE.template, { keyPath: 'id' })
          tplStore.createIndex('by-createdAt', 'createdAt')
        }
        if (!db.objectStoreNames.contains(STORE.inspection)) {
          const inspStore = db.createObjectStore(STORE.inspection, { keyPath: 'id' })
          inspStore.createIndex('by-detectedAt', 'detectedAt')
          inspStore.createIndex('by-type', 'type')
          inspStore.createIndex('by-handled', 'handled')
        }
      },
      blocked() {
        console.warn('[CloudPivot] IndexedDB 升级被阻塞：请关闭其它已打开的 CloudPivot 窗口。')
      },
      blocking() {
        console.warn('[CloudPivot] 当前窗口阻塞了数据库升级。')
      },
      terminated() {
        dbPromise = null
      }
    })
  }
  return dbPromise
}

/* ------------------------------------------------------------------ */
/* 通用 CRUD 封装                                                      */
/* ------------------------------------------------------------------ */

/**
 * 剥离一切不可被结构化克隆的对象（如 Vue reactive/ref 代理、函数、密钥等），
 * 返回纯 JSON 数据后写入 IndexedDB。JSON 丢失 undefined 属性，与 IndexedDB
 * 原生克隆约定一致；本项目存储结构均为纯 JSON，可安全使用。
 */
function toPlain<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  return JSON.parse(JSON.stringify(value)) as T
}

export async function putRecord<T>(store: string, value: T): Promise<T> {
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).put(store, toPlain(value))
  return value
}

export async function putMany<T>(store: string, values: T[]): Promise<void> {
  if (!values.length) return
  const db = await getDB()
  const plains = values.map(toPlain)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = (db as any).transaction(store, 'readwrite')
  await Promise.all([...plains.map((v) => tx.store.put(v)), tx.done])
}

export async function getRecord<T>(store: string, key: string): Promise<T | undefined> {
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (db as any).get(store, key)) as T | undefined
}

export async function getAllRecords<T>(store: string): Promise<T[]> {
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (await (db as any).getAll(store)) as T[]
}

export async function deleteRecord(store: string, key: string): Promise<void> {
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).delete(store, key)
}

export async function deleteMany(store: string, keys: string[]): Promise<void> {
  if (!keys.length) return
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tx = (db as any).transaction(store, 'readwrite')
  await Promise.all([...keys.map((k) => tx.store.delete(k)), tx.done])
}

export async function clearStore(store: string): Promise<void> {
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db as any).clear(store)
}

/* ------------------------------------------------------------------ */
/* 系统配置表                                                          */
/* ------------------------------------------------------------------ */

export async function getConfig<T>(key: string, fallback: T): Promise<T> {
  const record = await getRecord<{ key: string; value: T; updatedAt: number }>(STORE.config, key)
  return record ? record.value : fallback
}

export async function setConfig<T>(key: string, value: T): Promise<void> {
  await putRecord(STORE.config, { key, value, updatedAt: Date.now() })
}

export async function getAllConfig(): Promise<Record<string, unknown>> {
  const rows = await getAllRecords<{ key: string; value: unknown }>(STORE.config)
  return rows.reduce<Record<string, unknown>>((acc, row) => {
    acc[row.key] = row.value
    return acc
  }, {})
}

/** 主密钥读写（供 crypto 模块注入） */
export const masterKeyStorage = {
  load: (): Promise<EncryptedPayload | null> =>
    getConfig<EncryptedPayload | null>('__master_key__', null),
  save: (payload: EncryptedPayload): Promise<void> => setConfig('__master_key__', payload)
}

/* ------------------------------------------------------------------ */
/* 资源缓存（含容量控制）                                              */
/* ------------------------------------------------------------------ */

const CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7 // 7 天

export function cacheKey(accountId: string, kind: string, scope = 'all'): string {
  return `${accountId}:${kind}:${scope}`
}

export async function writeCache<T>(
  accountId: string,
  kind: string,
  scope: string,
  data: T
): Promise<void> {
  await putRecord<ResourceCacheRecord<T>>(STORE.cache, {
    key: cacheKey(accountId, kind, scope),
    accountId,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kind: kind as any,
    scope,
    data,
    cachedAt: Date.now()
  })
}

export async function readCache<T>(
  accountId: string,
  kind: string,
  scope = 'all'
): Promise<{ data: T; cachedAt: number } | null> {
  const record = await getRecord<ResourceCacheRecord<T>>(
    STORE.cache,
    cacheKey(accountId, kind, scope)
  )
  return record ? { data: record.data, cachedAt: record.cachedAt } : null
}

export async function readAllCacheByKind<T>(kind: string): Promise<ResourceCacheRecord<T>[]> {
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (db as any).getAllFromIndex(STORE.cache, 'by-kind', kind)) as
    | ResourceCacheRecord<T>[]
  return rows
}

export async function deleteAccountCache(accountId: string): Promise<void> {
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (db as any).getAllFromIndex(STORE.cache, 'by-account', accountId)) as
    | ResourceCacheRecord[]
  await deleteMany(
    STORE.cache,
    rows.map((r) => r.key)
  )
}

/** 清理过期缓存，避免离线数据无限增长 */
export async function purgeExpiredCache(): Promise<number> {
  const db = await getDB()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows = (await (db as any).getAll(STORE.cache)) as ResourceCacheRecord[]
  const now = Date.now()
  const stale = rows.filter((r) => now - r.cachedAt > CACHE_MAX_AGE_MS).map((r) => r.key)
  await deleteMany(STORE.cache, stale)
  return stale.length
}

/* ------------------------------------------------------------------ */
/* 操作日志表                                                          */
/* ------------------------------------------------------------------ */

export async function appendOperationLogs(logs: OperationLog[]): Promise<void> {
  await putMany(STORE.opLog, logs)
}

export async function queryOperationLogs(options: {
  from?: number
  to?: number
  level?: string
  module?: string
  accountId?: string
  keyword?: string
  limit?: number
  offset?: number
}): Promise<{ rows: OperationLog[]; total: number }> {
  const all = await getAllRecords<OperationLog>(STORE.opLog)
  const { from, to, level, module, accountId, keyword, limit = 50, offset = 0 } = options

  const filtered = all
    .filter((row) => {
      if (from && row.time < from) return false
      if (to && row.time > to) return false
      if (level && row.level !== level) return false
      if (module && row.module !== module) return false
      if (accountId && row.accountId !== accountId) return false
      if (keyword) {
        const kw = keyword.toLowerCase()
        const haystack = `${row.action} ${row.detail} ${row.accountName ?? ''} ${row.error ?? ''}`
        if (!haystack.toLowerCase().includes(kw)) return false
      }
      return true
    })
    .sort((a, b) => b.time - a.time)

  return { rows: filtered.slice(offset, offset + limit), total: filtered.length }
}

export async function getLatestOperationLog(): Promise<OperationLog | undefined> {
  const all = await getAllRecords<OperationLog>(STORE.opLog)
  return all.sort((a, b) => b.time - a.time)[0]
}

/** 按保留天数清理历史日志 */
export async function pruneOperationLogs(retentionDays: number): Promise<number> {
  if (retentionDays <= 0) return 0
  const cutoff = Date.now() - retentionDays * 86400000
  const all = await getAllRecords<OperationLog>(STORE.opLog)
  const stale = all.filter((row) => row.time < cutoff).map((row) => row.id)
  await deleteMany(STORE.opLog, stale)
  return stale.length
}

/**
 * 校验日志哈希链是否被篡改。
 * - 逐条重算内容哈希并比对（含首条之后的 prevHash 链接）
 * - 首条残留记录作为清理后的新锚点，其 prevHash 不再要求是 GENESIS（兼容按保留时长清理）
 */
export async function verifyLogChain(): Promise<{ valid: boolean; brokenAt?: string }> {
  const all = (await getAllRecords<OperationLog>(STORE.opLog)).sort((a, b) => a.time - b.time)
  let expectedPrev = 'GENESIS'
  for (let i = 0; i < all.length; i++) {
    const row = all[i]
    const payload = JSON.stringify({
      module: row.module,
      action: row.action,
      detail: row.detail,
      time: row.time
    })
    if (i === 0) {
      // 清理后的新起点：不校验锚值来源，只校验其内容 hash 是否被篡改
      if ((await sha256Hex(`${row.prevHash}::${payload}`)) !== row.hash) {
        return { valid: false, brokenAt: row.id }
      }
      expectedPrev = row.hash
      continue
    }
    if (row.prevHash !== expectedPrev) return { valid: false, brokenAt: row.id }
    if ((await sha256Hex(`${row.prevHash}::${payload}`)) !== row.hash) {
      return { valid: false, brokenAt: row.id }
    }
    expectedPrev = row.hash
  }
  return { valid: true }
}

/* ------------------------------------------------------------------ */
/* 批量任务表                                                          */
/* ------------------------------------------------------------------ */

export async function saveBatchTask(task: BatchTask): Promise<void> {
  await putRecord(STORE.task, task)
}

export async function listBatchTasks(limit = 100): Promise<BatchTask[]> {
  const all = await getAllRecords<BatchTask>(STORE.task)
  return all.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}

/* ------------------------------------------------------------------ */
/* 巡检表                                                              */
/* ------------------------------------------------------------------ */

export async function saveInspectionIssues(issues: InspectionIssue[]): Promise<void> {
  await putMany(STORE.inspection, issues)
}

export async function listInspectionIssues(onlyUnhandled = false): Promise<InspectionIssue[]> {
  const all = await getAllRecords<InspectionIssue>(STORE.inspection)
  const rows = onlyUnhandled ? all.filter((i) => !i.handled) : all
  return rows.sort((a, b) => b.detectedAt - a.detectedAt)
}

/* ------------------------------------------------------------------ */
/* 备份 / 还原                                                         */
/* ------------------------------------------------------------------ */

export interface BackupPayload {
  app: 'CloudPivot'
  version: string
  exportedAt: number
  /** 是否包含加密后的账号密钥（默认包含，恢复时需同一设备主密钥） */
  includeCredentials: boolean
  data: {
    accounts: CloudflareAccount[]
    groups: AccountGroup[]
    templates: DnsTemplate[]
    config: Record<string, unknown>
    logs: OperationLog[]
  }
}

export async function createBackup(includeCredentials = true): Promise<BackupPayload> {
  const [accounts, groups, templates, config, logs] = await Promise.all([
    getAllRecords<CloudflareAccount>(STORE.account),
    getAllRecords<AccountGroup>(STORE.group),
    getAllRecords<DnsTemplate>(STORE.template),
    getAllConfig(),
    getAllRecords<OperationLog>(STORE.opLog)
  ])

  const safeConfig = { ...config }
  if (!includeCredentials) delete safeConfig.__master_key__

  return {
    app: 'CloudPivot',
    version: '1.1.0',
    exportedAt: Date.now(),
    includeCredentials,
    data: {
      accounts: includeCredentials
        ? accounts
        : accounts.map((a) => ({ ...a, credential: { cipher: '', iv: '', alg: 'AES-GCM', kv: 1 } })),
      groups,
      templates,
      config: safeConfig,
      logs
    }
  }
}

export async function restoreBackup(
  payload: BackupPayload,
  options: { overwriteLogs?: boolean } = {}
): Promise<{ accounts: number; groups: number; templates: number }> {
  if (!payload || payload.app !== 'CloudPivot' || !payload.data) {
    throw new Error('备份文件格式不正确，无法还原')
  }
  const { accounts = [], groups = [], templates = [], config = {} } = payload.data

  if (groups.length) await putMany(STORE.group, groups)
  if (accounts.length) await putMany(STORE.account, accounts)
  if (templates.length) await putMany(STORE.template, templates)

  for (const [key, value] of Object.entries(config)) {
    // 主密钥仅在本机不存在时才恢复，避免覆盖当前设备可用密钥
    if (key === '__master_key__') {
      const existing = await getConfig<unknown>('__master_key__', null)
      if (existing) continue
    }
    await setConfig(key, value)
  }

  if (options.overwriteLogs && payload.data.logs?.length) {
    await clearStore(STORE.opLog)
    await putMany(STORE.opLog, payload.data.logs)
  }

  return { accounts: accounts.length, groups: groups.length, templates: templates.length }
}

/** 清空全部本地数据（危险操作，需二次确认），并重置会话内存主密钥 */
export async function wipeAllData(): Promise<void> {
  await Promise.all(Object.values(STORE).map((store) => clearStore(store)))
  resetMasterKeySession()
}

/**
 * 清空除账号外的全部数据：保留账号、分组与系统配置（含主密钥与设置），
 * 清除资源缓存 / 操作日志 / 批量任务 / DNS 模板 / 巡检记录，便于重新同步。
 */
export async function clearAllExceptAccounts(): Promise<void> {
  const keep = new Set<string>([STORE.account, STORE.group, STORE.config])
  const stores = Object.values(STORE).filter((s) => !keep.has(s))
  await Promise.all(stores.map((store) => clearStore(store)))
}

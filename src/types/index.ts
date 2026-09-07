/**
 * CloudPivot 全局业务类型定义
 */

/* ------------------------------------------------------------------ */
/* 主题                                                                */
/* ------------------------------------------------------------------ */
export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

/* ------------------------------------------------------------------ */
/* 账号                                                                */
/* ------------------------------------------------------------------ */
export type AccountAuthType = 'token' | 'globalKey'

/** 账号状态：正常 / 失效 / 权限不足 / 过期 / 未检测 */
export type AccountStatus = 'active' | 'invalid' | 'forbidden' | 'expired' | 'unknown'

/** 密钥载荷（仅存在于内存，持久化时整体加密） */
export interface AccountCredential {
  authType: AccountAuthType
  /** API Token */
  token?: string
  /** 邮箱 + Global API Key */
  email?: string
  globalKey?: string
}

/** 加密后的凭据存储结构 */
export interface EncryptedPayload {
  /** AES-GCM（256 位主密钥）密文（base64） */
  cipher: string
  /** 初始向量（base64） */
  iv: string
  /** 加密算法标识（Web Crypto 注册名为 AES-GCM，密钥长度由原始字节决定） */
  alg: 'AES-GCM'
  /** 密钥派生版本号，便于后续升级密钥策略 */
  kv: number
}

export interface CloudflareAccount {
  id: string
  /** 用户自定义账号名称 */
  name: string
  authType: AccountAuthType
  /** 展示用邮箱（Global Key 模式）或 Token 摘要，禁止存放明文密钥 */
  identity: string
  remark?: string
  tags: string[]
  groupId: string
  /** 是否置顶 */
  pinned: boolean
  /** Cloudflare 侧 account_id（用于 Workers/Pages 接口） */
  cfAccountId?: string
  /** Cloudflare 用户 id */
  cfUserId?: string
  status: AccountStatus
  statusMessage?: string
  /** 加密后的密钥 */
  credential: EncryptedPayload
  /** 资源统计缓存 */
  stats: AccountStats
  createdAt: number
  updatedAt: number
  lastCheckedAt?: number
  lastSyncAt?: number
  sortOrder: number
}

export interface AccountStats {
  zoneCount: number
  workerCount: number
  pagesCount: number
}

export interface AccountGroup {
  id: string
  name: string
  collapsed: boolean
  sortOrder: number
  createdAt: number
}

/** 新增账号输入 */
export interface AccountCreateInput {
  name: string
  authType: AccountAuthType
  token?: string
  email?: string
  globalKey?: string
  remark?: string
  tags?: string[]
  groupId: string
  pinned?: boolean
}

/* ------------------------------------------------------------------ */
/* Cloudflare V4 API 通用结构                                          */
/* ------------------------------------------------------------------ */
export interface CfError {
  code: number
  message: string
}

export interface CfResponse<T> {
  result: T
  success: boolean
  errors: CfError[]
  messages: { code: number; message: string }[]
  result_info?: {
    page?: number
    per_page?: number
    total_pages?: number
    count?: number
    total_count?: number
  }
}

export interface CfUser {
  id: string
  email: string
  username?: string
  status?: string
  suspended?: boolean
  accounts?: { id: string; name: string }[]
}

export type ZoneStatus =
  | 'active'
  | 'pending'
  | 'paused'
  | 'moved'
  | 'deleted'
  | 'deactivated'
  | 'initializing'
  | string

export interface CfZone {
  id: string
  name: string
  status: ZoneStatus
  paused: boolean
  type: string
  account?: { id: string; name: string }
  plan?: { id: string; name: string; is_subscribed?: boolean }
  name_servers?: string[]
  original_name_servers?: string[]
  activated_on?: string | null
  created_on?: string
  modified_on?: string
  /** 客户端本地补充字段 */
  __accountId?: string
}

export type DnsRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'TXT' | 'SRV' | 'CAA' | 'NS' | 'LOC'

export interface CfDnsRecord {
  id: string
  zone_id: string
  zone_name: string
  name: string
  type: DnsRecordType | string
  content: string
  proxiable: boolean
  proxied: boolean
  ttl: number
  priority?: number | null
  locked?: boolean
  comment?: string | null
  tags?: string[]
  created_on?: string
  modified_on?: string
  data?: Record<string, unknown>
  __accountId?: string
  __zoneName?: string
}

export interface CfWorkerScript {
  id: string
  created_on?: string
  modified_on?: string
  usage_model?: string
  compatibility_date?: string
  compatibility_flags?: string[]
  handlers?: string[]
  tail_consumers?: unknown[]
  __accountId?: string
}

export interface CfWorkerRoute {
  id: string
  script: string | null
  pattern: string
  zone_id?: string
  zone_name?: string
  __accountId?: string
}

export interface CfWorkerDomain {
  id: string
  cert_id?: string
  /** 域名/子域，请求会路由到对应 Worker */
  hostname: string
  /** 关联的 Worker 名称 */
  service: string
  zone_id?: string
  zone_name?: string
  environment?: string
  created_on?: string
}

export interface CfWorkerVariable {
  /** Cloudflare bindings 接口返回的字段名 */
  name?: string
  binding?: string
  type?: string
  text?: string
  script?: string
  namespace?: string
  service?: string
  environment?: string
}

export interface CfWorkerContent {
  main_module?: string
  body?: string
  script?: string
  content?: string
  modules?: { name: string; type: string; content?: string }[]
}

export interface CfPagesProject {
  id?: string
  name: string
  subdomain?: string
  domains?: string[]
  canonical_deployment?: CfPagesDeployment
  latest_deployment?: CfPagesDeployment
  production_branch?: string
  build_config?: {
    build_command?: string | null
    destination_dir?: string | null
    root_dir?: string | null
  }
  deployment_configs?: Record<
    string,
    { env_variables?: Record<string, { value: string; type?: string }> } | undefined
  >
  source?: { type?: string; url?: string }
  created_on?: string
  __accountId?: string
}

export interface CfPagesDeployment {
  id: string
  url?: string
  environment?: string
  latest_stage?: { name: string; status: string; started_on?: string; ended_on?: string }
  stages?: { name: string; status: string; started_on?: string; ended_on?: string }[]
  build_config?: Record<string, unknown>
  deployment_config?: Record<string, unknown>
  source?: { type?: string; url?: string }
  deployment_trigger?: {
    type?: string
    metadata?: {
      commit_hash?: string
      commit_message?: string
      branch?: string
      user_id?: string
      commit_dirty?: boolean
      commit_url?: string
    }
  }
  created_on?: string
  modified_on?: string
  aliases?: string[]
}

export interface CfAccessRule {
  id: string
  notes?: string | null
  allowed_modes?: string[]
  mode?: string
  configuration?: { target: string; value: string }
  scope?: { type: string; email?: string; user?: { id?: string; email?: string } }
  created_on?: string
  modified_on?: string
  group?: { id?: string; name?: string }
  __accountId?: string
  __zoneId?: string
  __zoneName?: string
}

export interface CfRateLimit {
  id: string
  /** 阈值（每分钟计数上限） */
  threshold?: number
  /** 上限（请求次数） */
  limit?: number
  description?: string
  disabled?: boolean
  match?: Record<string, unknown>
  bypass?: unknown[]
  blocked?: unknown[]
  action?: { mode: string; timeout?: number; response?: Record<string, unknown> }
  period?: number
  __accountId?: string
  __zoneId?: string
}

export interface CfRuleset {
  id: string
  name?: string
  description?: string
  kind?: string
  phase?: string
  version?: string
  last_updated?: string
  rules?: unknown[]
}

/* ------------------------------------------------------------------ */
/* 统计 / 仪表盘                                                       */
/* ------------------------------------------------------------------ */
export interface ZoneAnalyticsSummary {
  requests: { all: number; cached: number; http: number; https: number; threats: number }
  bandwidth: { all: number; cached: number }
  threats: { all: number; country?: Record<string, number> }
  pageViews?: { all: number }
  uniques?: { all: number }
}

export interface ZoneAnalyticsTimeseries {
  since: string
  until: string
  continuous?: boolean
  queries?: { all: number; cached: number }
  requests?: { all: number; cached: number; threats: number }
  bandwidth?: { all: number; cached: number }
  threats?: { all: number }
}

export interface DashboardMetrics {
  accountTotal: number
  accountActive: number
  accountAbnormal: number
  zoneTotal: number
  workerTotal: number
  pagesTotal: number
  requestsToday: number
  bandwidthToday: number
  cacheHitRate: number
  threatsToday: number
}

export interface DashboardSeries {
  /** 时间轴标签 */
  times: string[]
  requests: number[]
  bandwidth: number[]
  cached: number[]
  threats: number[]
}

/* ------------------------------------------------------------------ */
/* 批量任务                                                            */
/* ------------------------------------------------------------------ */
export type BatchTaskType =
  | 'dns-create'
  | 'dns-update'
  | 'dns-delete'
  | 'worker-deploy'
  | 'worker-delete'
  | 'worker-vars'
  | 'worker-route'
  | 'pages-rebuild'
  | 'pages-env'
  | 'pages-auto-deploy'
  | 'waf-sync'
  | 'account-check'
  | 'account-refresh'
  | 'account-delete'
  | 'template-sync'

export type BatchTaskStatus = 'pending' | 'running' | 'paused' | 'finished' | 'aborted' | 'failed'

export interface BatchSubTaskResult {
  accountId: string
  accountName: string
  target: string
  success: boolean
  message?: string
  finishedAt: number
}

export interface BatchTask {
  id: string
  type: BatchTaskType
  title: string
  status: BatchTaskStatus
  total: number
  successCount: number
  failCount: number
  doneCount: number
  createdAt: number
  startedAt?: number
  finishedAt?: number
  /** 二次确认标记（高危操作） */
  dangerous: boolean
  payload: Record<string, unknown>
  results: BatchSubTaskResult[]
}

/* ------------------------------------------------------------------ */
/* 日志                                                                */
/* ------------------------------------------------------------------ */
export type LogLevel = 'debug' | 'info' | 'success' | 'warning' | 'error'

export interface OperationLog {
  id: string
  time: number
  level: LogLevel
  module: string
  action: string
  detail: string
  accountId?: string
  accountName?: string
  result: 'success' | 'fail'
  error?: string
  /** 日志防篡改校验值（上一条 hash + 本条内容 hash 链） */
  hash: string
  prevHash: string
}

/* ------------------------------------------------------------------ */
/* 资源缓存                                                            */
/* ------------------------------------------------------------------ */
export type ResourceKind = 'zone' | 'dns' | 'worker' | 'pages' | 'waf' | 'analytics'

export interface ResourceCacheRecord<T = unknown> {
  /** `${accountId}:${kind}:${scope}` */
  key: string
  accountId: string
  kind: ResourceKind
  scope: string
  data: T
  cachedAt: number
}

/* ------------------------------------------------------------------ */
/* 系统配置                                                            */
/* ------------------------------------------------------------------ */
export type SyncIntervalMinutes = 1 | 5 | 10 | 30

export interface SystemConfig {
  themeMode: ThemeMode
  syncInterval: SyncIntervalMinutes
  autoSyncEnabled: boolean
  backupPath?: string
  logRetentionDays: number
  concurrencyLimit: number
  requestTimeout: number
  retryTimes: number
  inspectionEnabled: boolean
  inspectionIntervalMinutes: number
}

/* ------------------------------------------------------------------ */
/* 巡检                                                                */
/* ------------------------------------------------------------------ */
export type InspectionType = 'account-invalid' | 'dns-error' | 'quota-exceeded' | 'zone-paused'

export interface InspectionIssue {
  id: string
  type: InspectionType
  level: LogLevel
  accountId: string
  accountName: string
  title: string
  detail: string
  detectedAt: number
  handled: boolean
}

/* ------------------------------------------------------------------ */
/* DNS 模板                                                            */
/* ------------------------------------------------------------------ */
export interface DnsTemplate {
  id: string
  name: string
  records: Array<{
    type: DnsRecordType
    name: string
    content: string
    ttl: number
    proxied: boolean
    priority?: number
    comment?: string
  }>
  createdAt: number
}

/* ------------------------------------------------------------------ */
/* 备份                                                                */
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

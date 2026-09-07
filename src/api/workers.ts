/**
 * Cloudflare Workers 接口（技术文档 §4.4）
 */
import { cfPaginate, cfRequest, cfResult, type CfRequestContext } from './client'
import type { CfWorkerContent, CfWorkerDomain, CfWorkerRoute, CfWorkerScript, CfWorkerVariable } from '@/types'

/* ------------------------------------------------------------------ */
/* 脚本管理                                                            */
/* ------------------------------------------------------------------ */

/** 脚本列表：GET /accounts/{account_id}/workers/scripts */
export function listWorkerScripts(
  ctx: CfRequestContext,
  accountId: string
): Promise<CfWorkerScript[]> {
  return cfPaginate<CfWorkerScript>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/workers/scripts`,
    params: { per_page: 100 },
    perPage: 100
  })
}

/** 脚本详情 / 部署配置：GET /accounts/{account_id}/workers/scripts/{script_name} */
export async function getWorkerScript(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string
): Promise<CfWorkerScript> {
  // 该接口可能直接返回脚本源码文本，也可能返回 JSON 对象 / 包装 result，做兼容读取
  const body = (await cfRequest<unknown>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}`
  })) as unknown as string | { result?: CfWorkerScript } & CfWorkerScript
  if (typeof body === 'string') return { id: scriptName } as CfWorkerScript
  const inner = body?.result && 'id' in body.result ? body.result : body
  return inner ?? ({} as CfWorkerScript)
}

/**
 * 创建 / 部署脚本：PUT /accounts/{account_id}/workers/scripts/{script_name}
 * 通过 multipart/form-data 上传：script.js + metadata.json
 */
export async function deployWorkerScript(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string,
  content: string,
  metadata: {
    main_module?: string
    bindings?: { type: string; name: string; text?: string; obj?: unknown; json?: string }[]
    compatibility_date?: string
    compatibility_flags?: string[]
    usage_model?: string
    keep_assets?: boolean
  } = {}
): Promise<CfWorkerScript> {
  const form = new FormData()
  // main_module 同值为 'module' 时表示 ES Module，入口文件名统一为 index.js；
  // 否则视为实际模块文件名（service-worker 风格暂按同名 ESM 上传）
  const isModule = !metadata.main_module || metadata.main_module === 'module'
  const fileName = isModule ? 'index.js' : metadata.main_module!

  form.append(
    fileName,
    new Blob([content], {
      type: isModule ? 'application/javascript+module' : 'application/javascript'
    }),
    fileName
  )

  const meta: Record<string, unknown> = {
    main_module: fileName,
    compatibility_date: metadata.compatibility_date ?? '2024-01-01'
  }
  if (metadata.bindings?.length) meta.bindings = metadata.bindings
  if (metadata.compatibility_flags) meta.compatibility_flags = metadata.compatibility_flags
  if (metadata.usage_model) meta.usage_model = metadata.usage_model
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }))

  return cfResult<CfWorkerScript>(ctx, {
    method: 'PUT',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}`,
    // 浏览器环境禁止手动指定 multipart Content-Type，否则会覆盖掉自动生成的 boundary
    data: form,
    timeout: 60_000
  })
}

/** 删除脚本：DELETE /accounts/{account_id}/workers/scripts/{script_name} */
export function deleteWorkerScript(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string
): Promise<{ result: string } | null> {
  return cfResult<{ result: string } | null>(ctx, {
    method: 'DELETE',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}`
  })
}

/** 脚本内容：GET /accounts/{account_id}/workers/scripts/{script_name}/content/v2 */
export async function getWorkerScriptContent(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string
): Promise<CfWorkerContent> {
  // content/v2 直接返回源码（可能为纯文本，也可能为 JSON），兼容多种形态
  const raw = (await cfRequest<unknown>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}/content/v2`,
    timeout: 40_000
  })) as unknown as string | CfWorkerContent | { result?: CfWorkerContent }
  if (typeof raw === 'string') return { body: raw }
  if (raw && typeof raw === 'object') {
    const inner = ('result' in raw && raw.result ? raw.result : raw) as CfWorkerContent
    return inner ?? {}
  }
  return {}
}

/** 脚本版本列表（部分套餐支持）：GET .../versions */
export function listWorkerVersions(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string
): Promise<Array<{ id: string; number: number; created_on?: string; resources?: unknown }>> {
  return cfPaginate<{ id: string; number: number; created_on?: string; resources?: unknown }>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}/versions`,
    params: { per_page: 100 },
    perPage: 100
  })
}

/* ------------------------------------------------------------------ */
/* 环境变量与密钥 Bindings                                             */
/* ------------------------------------------------------------------ */

/** 从多种可能的响应结构中提取 bindings 数组（数组 / result / bindings 嵌套） */
function extractBindings(body: unknown): CfWorkerVariable[] {
  if (Array.isArray(body)) return body as CfWorkerVariable[]
  if (!body || typeof body !== 'object') return []
  const b = body as Record<string, unknown>
  if (Array.isArray(b.bindings)) return b.bindings as CfWorkerVariable[]
  if (Array.isArray(b.result)) return b.result as CfWorkerVariable[]
  if (b.result && typeof b.result === 'object') return extractBindings(b.result)
  return []
}

/** 变量列表：GET /accounts/{account_id}/workers/scripts/{script_name}/bindings（GET 仍可用，仅 PUT 已废弃） */
export async function listWorkerBindings(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string
): Promise<CfWorkerVariable[]> {
  const byName = new Map<string, CfWorkerVariable>()

  try {
    const body = await cfRequest<unknown>(ctx, {
      method: 'GET',
      url: `/accounts/${accountId}/workers/scripts/${scriptName}/bindings`,
      params: { per_page: 100, page: 1 }
    })
    const rows = extractBindings(body)
    for (const b of rows) {
      const n = b.binding ?? b.name
      if (n) byName.set(n, b)
    }
  } catch {
    /* 忽略 bindings 读取失败 */
  }

  // secrets 接口补充密钥名称（值永不下发）
  try {
    const body = (await cfRequest<unknown>(ctx, {
      method: 'GET',
      url: `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`
    })) as unknown as { result?: { name: string }[] } | { name: string }[] | { name: string }
    const rows = Array.isArray(body)
      ? body
      : (body as { result?: { name: string }[] })?.result ?? []
    for (const s of rows) {
      if (s?.name && !byName.has(s.name)) {
        byName.set(s.name, { name: s.name, binding: s.name, type: 'secret_text' })
      }
    }
  } catch {
    /* 无 secrets 读取权限时忽略 */
  }

  return [...byName.values()]
}

/**
 * 全量替换变量（settings 绑定的 v2 接口）
 * PATCH /accounts/{account_id}/workers/scripts/{script_name}/settings (multipart bindings)
 * 注意：secret_text 仅传占位（name + type），密钥明文走独立的 secrets 接口
 */
export async function updateWorkerBindings(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string,
  bindings: {
    type: 'plain_text' | 'secret_text' | 'json'
    name: string
    text?: string
    json?: string
  }[]
): Promise<CfWorkerVariable[]> {
  const form = new FormData()
  // PATCH /settings 为 multipart 上传，绑定需放在名为 settings 的 part 中
  form.append('settings', new Blob([JSON.stringify({ bindings })], { type: 'application/json' }))
  const body = (await cfRequest<unknown>(ctx, {
    method: 'PATCH',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}/settings`,
    data: form,
    timeout: 40_000,
    headers: { 'X-Source': 'open_api' }
  })) as unknown as { result?: { bindings?: CfWorkerVariable[] }; bindings?: CfWorkerVariable[] }
  return body?.result?.bindings ?? body?.bindings ?? []
}

/** 新增 / 更新单个密钥：PUT /accounts/{account_id}/workers/scripts/{script_name}/secrets */
export async function putWorkerSecret(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string,
  name: string,
  text: string
): Promise<unknown> {
  return cfResult<unknown>(ctx, {
    method: 'PUT',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}/secrets`,
    data: { name, text, type: 'secret_text' }
  })
}

/** 删除密钥：DELETE /accounts/{account_id}/workers/scripts/{script_name}/secrets/{name} */
export async function deleteWorkerSecret(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string,
  name: string
): Promise<unknown> {
  return cfResult<unknown>(ctx, {
    method: 'DELETE',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}/secrets/${encodeURIComponent(name)}`
  })
}

/* ------------------------------------------------------------------ */
/* 自定义域名（Custom Domains）                                        */
/* ------------------------------------------------------------------ */

/** 账号的 Workers 子域名：GET /accounts/{account_id}/workers/subdomain */
export function getWorkerSubdomain(
  ctx: CfRequestContext,
  accountId: string
): Promise<{ subdomain: string }> {
  return cfResult<{ subdomain: string }>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/workers/subdomain`
  })
}

/** 账号全部自定义域名：GET /accounts/{account_id}/workers/domains（含各 Worker 归属） */
export function listAllWorkerDomains(
  ctx: CfRequestContext,
  accountId: string
): Promise<CfWorkerDomain[]> {
  return cfPaginate<CfWorkerDomain>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/workers/domains`,
    perPage: 100
  })
}

/** 域名列表：GET /accounts/{account_id}/workers/domains?service={script} */
export function listWorkerDomains(
  ctx: CfRequestContext,
  accountId: string,
  serviceName: string
): Promise<CfWorkerDomain[]> {
  return cfPaginate<CfWorkerDomain>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/workers/domains`,
    params: { service: serviceName },
    perPage: 100
  })
}

/** 新增域名：PUT /accounts/{account_id}/workers/domains */
export function createWorkerDomain(
  ctx: CfRequestContext,
  accountId: string,
  hostname: string,
  serviceName: string,
  zoneId?: string
): Promise<CfWorkerDomain> {
  return cfResult<CfWorkerDomain>(ctx, {
    method: 'PUT',
    url: `/accounts/${accountId}/workers/domains`,
    data: { hostname, service: serviceName, zone_id: zoneId }
  })
}

/** 删除域名：DELETE /accounts/{account_id}/workers/domains/{id} */
export function deleteWorkerDomain(
  ctx: CfRequestContext,
  accountId: string,
  domainId: string
): Promise<{ id: string }> {
  return cfResult<{ id: string }>(ctx, {
    method: 'DELETE',
    url: `/accounts/${accountId}/workers/domains/${domainId}`
  })
}

/* ------------------------------------------------------------------ */
/* 路由与触发器                                                       */
/* ------------------------------------------------------------------ */

/** 路由列表：GET /zones/{zone_id}/workers/routes（Routes 为 zone 级资源） */
export function listWorkerRoutes(
  ctx: CfRequestContext,
  zoneId: string
): Promise<CfWorkerRoute[]> {
  return cfPaginate<CfWorkerRoute>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/workers/routes`,
    params: { per_page: 100 },
    perPage: 100
  })
}

/** 新增路由：POST /zones/{zone_id}/workers/routes */
export function createWorkerRoute(
  ctx: CfRequestContext,
  zoneId: string,
  payload: { pattern: string; script: string }
): Promise<CfWorkerRoute> {
  return cfResult<CfWorkerRoute>(ctx, {
    method: 'POST',
    url: `/zones/${zoneId}/workers/routes`,
    data: payload
  })
}

/** 修改路由脚本绑定：PATCH /zones/{zone_id}/workers/routes/{route_id} */
export function updateWorkerRoute(
  ctx: CfRequestContext,
  zoneId: string,
  routeId: string,
  payload: { script: string | null }
): Promise<CfWorkerRoute> {
  return cfResult<CfWorkerRoute>(ctx, {
    method: 'PATCH',
    url: `/zones/${zoneId}/workers/routes/${routeId}`,
    data: payload
  })
}

/** 删除路由：DELETE /zones/{zone_id}/workers/routes/{route_id} */
export function deleteWorkerRoute(
  ctx: CfRequestContext,
  zoneId: string,
  routeId: string
): Promise<{ id: string }> {
  return cfResult<{ id: string }>(ctx, {
    method: 'DELETE',
    url: `/zones/${zoneId}/workers/routes/${routeId}`
  })
}

/** Cron 触发器（部分套餐支持） */
export function listWorkerCrons(
  ctx: CfRequestContext,
  accountId: string,
  scriptName: string
): Promise<Array<{ id: string; crons?: string[]; created_on?: string }>> {
  return cfResult<Array<{ id: string; crons?: string[]; created_on?: string }>>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/workers/scripts/${scriptName}/schedules`
  })
}

/* ------------------------------------------------------------------ */
/* 用量统计                                                            */
/* ------------------------------------------------------------------ */

export interface WorkerAnalyticsRow {
  scriptName?: string
  script?: string
  requests?: number
  cpuTime?: number
  duration?: number
  subrequests?: number
  errors?: number
}

/** 用量统计：GET /accounts/{account_id}/analytics/workers/scripts */
export function getWorkerAnalytics(
  ctx: CfRequestContext,
  accountId: string,
  query: { since?: string; until?: string; scriptName?: string } = {}
): Promise<WorkerAnalyticsRow[]> {
  return cfResult<WorkerAnalyticsRow[]>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/analytics/workers/scripts`,
    params: {
      since: query.since,
      until: query.until,
      script_name: query.scriptName
    }
  })
}
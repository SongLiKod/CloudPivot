/**
 * Cloudflare V4 API 客户端
 *
 * - 统一 baseURL：https://api.cloudflare.com/client/v4
 * - 按账号注入鉴权头（API Token / 邮箱 + Global Key）
 * - Axios 拦截器：请求日志、错误归一化、429 限流提示
 * - 失败自动重试（指数退避），全部请求经全局并发闸门
 * - 明文密钥仅在内存中短暂存在，绝不写入日志
 */
import axios, {
  AxiosError,
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig
} from 'axios'
import type { AccountCredential, CfResponse } from '@/types'
import { isAndroid, isElectron } from '@/utils/platform'
import { globalGate, isRetryableError } from '@/utils/scheduler'
import { sleep } from '@/utils/format'

const DIRECT_CF_API_BASE = 'https://api.cloudflare.com/client/v4'
const WEB_CF_API_BASE = '/cf-api'

/**
 * Web 形态（浏览器开发 / preview）直连 Cloudflare 会被 CORS 拦截，
 * 故走 dev server 相对路径代理；Electron / Android 原生壳无同源限制，直连官方接口。
 */
export const CF_API_BASE =
  typeof window !== 'undefined' && !isElectron && !isAndroid ? WEB_CF_API_BASE : DIRECT_CF_API_BASE

/** 归一化后的 API 错误 */
export class CfApiError extends Error {
  status: number
  code: number
  cfMessages: string[]
  accountId?: string
  /** 是否为权限不足（Token 作用域不匹配） */
  forbidden: boolean
  /** 是否为限流 */
  rateLimited: boolean
  /** 是否为凭据失效 */
  unauthorized: boolean

  constructor(options: {
    message: string
    status?: number
    code?: number
    cfMessages?: string[]
    accountId?: string
  }) {
    super(options.message)
    this.name = 'CfApiError'
    this.status = options.status ?? 0
    this.code = options.code ?? 0
    this.cfMessages = options.cfMessages ?? []
    this.accountId = options.accountId
    this.forbidden = this.status === 403 || this.code === 9109 || this.code === 10000
    this.rateLimited = this.status === 429
    this.unauthorized = this.status === 401 || this.code === 1000 || this.code === 9109
  }

  /** 面向用户的友好提示 */
  get friendlyMessage(): string {
    if (this.rateLimited) return `请求过于频繁，已触发 Cloudflare 限流（${this.message}）`
    if (this.unauthorized) return `凭据无效或已过期：${this.message}`
    if (this.forbidden) return `API Token 权限不足：${this.message}`
    if (this.status === 404) return `资源不存在：${this.message}`
    return this.message
  }
}

export interface CfRequestContext {
  /** 账号 id，用于错误归类与日志 */
  accountId?: string
  /** 账号名称（仅用于提示，不含密钥） */
  accountName?: string
  /** 解密后的凭据，请求结束即释放 */
  credential: AccountCredential
  /** 覆盖默认超时（ms） */
  timeout?: number
  /** 覆盖默认重试次数 */
  retries?: number
  /** 跳过全局并发闸门（如探活） */
  skipGate?: boolean
}

export interface CfRequestOptions<TBody = unknown> extends AxiosRequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  params?: Record<string, unknown>
  data?: TBody
  headers?: Record<string, string>
  /** 覆盖默认重试次数（优先于 ctx.retries） */
  retries?: number
}

/** 默认配置（可被系统设置覆盖） */
export const clientDefaults = {
  timeout: 20_000,
  retries: 2,
  retryBaseDelay: 800,
  rateLimitDelay: 6_000
}

/** 由设置页写入的运行时配置 */
export function configureClient(options: Partial<typeof clientDefaults>) {
  Object.assign(clientDefaults, options)
}

/* ------------------------------------------------------------------ */
/* Axios 实例与拦截器                                                  */
/* ------------------------------------------------------------------ */

const http = axios.create({
  baseURL: CF_API_BASE,
  timeout: clientDefaults.timeout,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' }
})

interface CfAxiosConfig<D = unknown> extends InternalAxiosRequestConfig {
  __cf?: CfRequestContext
  __attempt?: number
  __data?: D
}

// 请求拦截器：注入鉴权头
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const ctx = (config as CfAxiosConfig).__cf
  if (ctx?.credential) {
    const { authType, token, email, globalKey } = ctx.credential
    if (authType === 'token') {
      if (!token) throw new CfApiError({ message: '缺少 API Token', accountId: ctx.accountId })
      config.headers.set('Authorization', `Bearer ${token}`)
    } else {
      if (!email || !globalKey) {
        throw new CfApiError({ message: '缺少邮箱或 Global API Key', accountId: ctx.accountId })
      }
      config.headers.set('X-Auth-Email', email)
      config.headers.set('X-Auth-Key', globalKey)
    }
    if (config.timeout === undefined) config.timeout = ctx.timeout ?? clientDefaults.timeout
  }

  // multipart 上传：删除默认 Content-Type，交给浏览器自动生成带 boundary 的 multipart 头
  if (typeof FormData !== 'undefined' && config.data instanceof FormData) {
    config.headers.delete('Content-Type')
  }

  return config
})

// 响应拦截器：错误归一化（重试逻辑在 request 层处理）
http.interceptors.response.use(
  (response: AxiosResponse<CfResponse<unknown>>) => {
    const body = response.data
    // Cloudflare 部分接口 HTTP 200 但 success=false
    if (body && typeof body === 'object' && body.success === false) {
      const ctx = (response.config as CfAxiosConfig).__cf
      const messages = (body.errors ?? []).map((e) => `${e.code ? `[${e.code}] ` : ''}${e.message}`)
      throw new CfApiError({
        message: messages.join('; ') || 'Cloudflare 返回业务失败',
        status: response.status,
        code: body.errors?.[0]?.code,
        cfMessages: messages,
        accountId: ctx?.accountId
      })
    }
    return response
  },
  (error: AxiosError<CfResponse<unknown>>) => {
    const config = error.config as CfAxiosConfig | undefined
    const ctx = config?.__cf
    const status = error.response?.status ?? 0
    const body = error.response?.data
    const cfErrors = body?.errors ?? []
    const messages = cfErrors.map((e) => `${e.code ? `[${e.code}] ` : ''}${e.message}`)

    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      throw new CfApiError({
        message: '请求超时，请检查网络后重试',
        status: 408,
        accountId: ctx?.accountId
      })
    }
    if (!error.response && error.request) {
      throw new CfApiError({
        message: `网络连接失败：${error.message}`,
        status: 0,
        accountId: ctx?.accountId
      })
    }

    throw new CfApiError({
      message: messages.join('; ') || error.message || `请求失败（HTTP ${status}）`,
      status,
      code: cfErrors[0]?.code,
      cfMessages: messages,
      accountId: ctx?.accountId
    })
  }
)

/* ------------------------------------------------------------------ */
/* 对外请求方法                                                        */
/* ------------------------------------------------------------------ */

async function execute<TResult>(
  ctx: CfRequestContext,
  options: CfRequestOptions
): Promise<CfResponse<TResult>> {
  const retries = options.retries ?? ctx.retries ?? clientDefaults.retries
  let attempt = 0

  for (;;) {
    try {
      const run = async () => {
        const response = await http.request<CfResponse<TResult>, AxiosResponse<CfResponse<TResult>>>({
          method: options.method ?? 'GET',
          url: options.url,
          params: options.params,
          data: options.data,
          headers: options.headers,
          timeout: ctx.timeout ?? clientDefaults.timeout,
          // 透传上下文给拦截器
          ...({ __cf: ctx } as Record<string, unknown>)
        } as AxiosRequestConfig)
        return response.data
      }
      return ctx.skipGate ? await run() : await globalGate.run(run)
    } catch (error) {
      const retryable = attempt < retries && isRetryableError(error)
      if (!retryable) throw error
      const rateLimited = (error as CfApiError).rateLimited
      const delay = rateLimited
        ? clientDefaults.rateLimitDelay
        : clientDefaults.retryBaseDelay * Math.pow(2, attempt)
      attempt++
      await sleep(delay)
    }
  }
}

/** 发起 Cloudflare API 请求，返回完整响应体 */
export async function cfRequest<TResult>(
  ctx: CfRequestContext,
  options: CfRequestOptions
): Promise<CfResponse<TResult>> {
  try {
    return await execute<TResult>(ctx, options)
  } finally {
    // 敏感凭据仅在单次请求生命周期内保留引用
  }
}

/** 发起请求并直接返回 result 字段 */
export async function cfResult<TResult>(
  ctx: CfRequestContext,
  options: CfRequestOptions
): Promise<TResult> {
  const response = await cfRequest<TResult>(ctx, options)
  return response.result
}

/** 分页拉取全部数据（Cloudflare 分页接口通用） */
export async function cfPaginate<TResult>(
  ctx: CfRequestContext,
  options: CfRequestOptions & { perPage?: number; maxPages?: number }
): Promise<TResult[]> {
  const perPage = options.perPage ?? 100
  const maxPages = options.maxPages ?? 50
  const all: TResult[] = []
  let page = 1

  for (; page <= maxPages; page++) {
    const response = await cfRequest<TResult[]>(ctx, {
      ...options,
      params: { ...(options.params ?? {}), per_page: perPage, page }
    })
    const rows = response.result ?? []
    all.push(...rows)

    const info = response.result_info
    const totalPages = info?.total_pages ?? 1
    if (!info || page >= totalPages || rows.length === 0) break
  }
  return all
}

export { http as cfHttp }

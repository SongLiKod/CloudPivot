/**
 * 账号鉴权与配额接口（技术文档 §4.1）
 */
import { cfRequest, cfResult, type CfRequestContext } from './client'
import type { CfUser, CfResponse } from '@/types'

export interface CfRateLimitInfo {
  /** Cloudflare 返回结构随版本变化，这里保留宽松字段 */
  [key: string]: unknown
}

/** 校验 Token 有效性并获取账号基础信息：GET /user */
export function verifyCredential(ctx: CfRequestContext): Promise<CfUser> {
  return cfResult<CfUser>(ctx, { method: 'GET', url: '/user', retries: 1, timeout: 15_000 })
}

/** 获取完整响应（含 messages，用于权限诊断） */
export function verifyCredentialRaw(ctx: CfRequestContext): Promise<CfResponse<CfUser>> {
  return cfRequest<CfUser>(ctx, { method: 'GET', url: '/user', retries: 1, timeout: 15_000 })
}

/**
 * Token 权限详情：GET /user/tokens/verify
 * 仅 API Token 模式可用，用于识别"权限不足"状态
 */
export interface TokenVerifyResult {
  id?: string
  status?: string
  not_before?: string
  expires_on?: string
}

export function verifyToken(ctx: CfRequestContext): Promise<TokenVerifyResult> {
  return cfResult<TokenVerifyResult>(ctx, {
    method: 'GET',
    url: '/user/tokens/verify',
    retries: 1,
    timeout: 15_000
  })
}

/** 账号流量 / Workers 配额：GET /user/rate_limit */
export function getRateLimit(ctx: CfRequestContext): Promise<CfRateLimitInfo> {
  return cfResult<CfRateLimitInfo>(ctx, { method: 'GET', url: '/user/rate_limit', retries: 1 })
}

/** 账号列表（Global Key 模式下用于取得 account_id） */
export interface CfAccountEntry {
  id: string
  name: string
  type?: string
  settings?: Record<string, unknown>
}

export function listAccounts(ctx: CfRequestContext): Promise<CfAccountEntry[]> {
  return cfResult<CfAccountEntry[]>(ctx, { method: 'GET', url: '/accounts' })
}

/** 当前用户所属账号（Global Key 常用） */
export function listUserAccounts(ctx: CfRequestContext): Promise<CfAccountEntry[]> {
  return cfResult<CfAccountEntry[]>(ctx, {
    method: 'GET',
    url: '/accounts',
    params: { per_page: 100 }
  })
}

/** 账号级配额与订阅信息：GET /accounts/{account_id}/subscriptions */
export function getAccountSubscriptions(
  ctx: CfRequestContext,
  accountId: string
): Promise<unknown[]> {
  return cfResult<unknown[]>(ctx, { method: 'GET', url: `/accounts/${accountId}/subscriptions` })
}

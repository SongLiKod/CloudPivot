/**
 * WAF 安全规则接口（技术文档 §4.6）
 * - 托管规则集 Rulesets
 * - IP 访问规则（黑白名单）
 * - 速率限制 Rate Limits
 */
import { cfPaginate, cfRequest, cfResult, type CfRequestContext } from './client'
import type { CfAccessRule, CfRateLimit, CfRuleset } from '@/types'

/* ------------------------------------------------------------------ */
/* 规则集 Rulesets                                                     */
/* ------------------------------------------------------------------ */

/** 规则集列表：GET /zones/{zone_id}/rulesets */
export function listZoneRulesets(ctx: CfRequestContext, zoneId: string): Promise<CfRuleset[]> {
  return cfResult<CfRuleset[]>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/rulesets`
  })
}

/** 指定 phases 的规则成语列表 */
export function listZoneRulesetsByPhase(
  ctx: CfRequestContext,
  zoneId: string,
  phase:
    | 'http_request_firewall_managed'
    | 'http_request_firewall_custom'
    | 'http_ratelimit'
    | 'http_request_sanitize'
): Promise<CfRuleset[]> {
  return cfResult<CfRuleset[]>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/rulesets`,
    params: { phase }
  })
}

/** 规则集详情：GET /zones/{zone_id}/rulesets/{ruleset_id} */
export function getZoneRuleset(
  ctx: CfRequestContext,
  zoneId: string,
  rulesetId: string
): Promise<CfRuleset> {
  return cfResult<CfRuleset>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/rulesets/${rulesetId}`
  })
}

/* ------------------------------------------------------------------ */
/* IP 访问规则（黑白名单）                                             */
/* ------------------------------------------------------------------ */

export interface AccessRulePayload {
  mode: 'block' | 'challenge' | 'whitelist' | 'js_challenge' | 'managed_challenge'
  configuration: { target: 'ip' | 'ip_range' | 'asn' | 'country'; value: string }
  notes?: string
}

/** 列表：GET /zones/{zone_id}/firewall/access_rules/rules */
export function listAccessRules(
  ctx: CfRequestContext,
  zoneId: string,
  query: { mode?: string; configuration_target?: string; configuration_value?: string } = {}
): Promise<CfAccessRule[]> {
  return cfPaginate<CfAccessRule>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/firewall/access_rules/rules`,
    params: { ...query, per_page: 100 },
    perPage: 100
  })
}

/** 新增：POST /zones/{zone_id}/firewall/access_rules/rules */
export function createAccessRule(
  ctx: CfRequestContext,
  zoneId: string,
  payload: AccessRulePayload
): Promise<CfAccessRule> {
  return cfResult<CfAccessRule>(ctx, {
    method: 'POST',
    url: `/zones/${zoneId}/firewall/access_rules/rules`,
    data: payload
  })
}

/** 修改：PUT /zones/{zone_id}/firewall/access_rules/rules/{rule_id} */
export function updateAccessRule(
  ctx: CfRequestContext,
  zoneId: string,
  ruleId: string,
  payload: Partial<AccessRulePayload>
): Promise<CfAccessRule> {
  return cfResult<CfAccessRule>(ctx, {
    method: 'PUT',
    url: `/zones/${zoneId}/firewall/access_rules/rules/${ruleId}`,
    data: payload
  })
}

/** 删除：DELETE /zones/{zone_id}/firewall/access_rules/rules/{rule_id} */
export function deleteAccessRule(
  ctx: CfRequestContext,
  zoneId: string,
  ruleId: string
): Promise<{ id: string }> {
  return cfResult<{ id: string }>(ctx, {
    method: 'DELETE',
    url: `/zones/${zoneId}/firewall/access_rules/rules/${ruleId}`
  })
}

/** 批量新增（带粗略错误信息收集） */
export async function createAccessRulesBulk(
  ctx: CfRequestContext,
  zoneId: string,
  payloads: AccessRulePayload[]
): Promise<{ ok: number; fails: Array<{ payload: AccessRulePayload; message: string }> }> {
  const ok: CfAccessRule[] = []
  const fails: Array<{ payload: AccessRulePayload; message: string }> = []
  for (const payload of payloads) {
    try {
      ok.push(await createAccessRule(ctx, zoneId, payload))
    } catch (error) {
      fails.push({ payload, message: (error as Error).message })
    }
  }
  return { ok: ok.length, fails }
}

/* ------------------------------------------------------------------ */
/* 速率限制 Rate Limits                                                */
/* ------------------------------------------------------------------ */

export interface RateLimitPayload {
  description?: string
  match: {
    request: { methods?: string[]; schemes?: string[]; url: string }
  }
  action: { mode: 'simulate' | 'ban' | 'challenge' | 'js_challenge'; timeout?: number }
  period: 10 | 60 | 600 | 3600 | 86400
  disabled?: boolean
  limit?: number
}

/** 列表：GET /zones/{zone_id}/rate_limits */
export function listRateLimits(
  ctx: CfRequestContext,
  zoneId: string
): Promise<CfRateLimit[]> {
  return cfPaginate<CfRateLimit>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/rate_limits`,
    params: { per_page: 100 },
    perPage: 100
  })
}

/** 新增：POST /zones/{zone_id}/rate_limits */
export function createRateLimit(
  ctx: CfRequestContext,
  zoneId: string,
  payload: RateLimitPayload
): Promise<CfRateLimit> {
  return cfResult<CfRateLimit>(ctx, {
    method: 'POST',
    url: `/zones/${zoneId}/rate_limits`,
    data: payload
  })
}

/** 修改：PUT /zones/{zone_id}/rate_limits/{rule_id} */
export function updateRateLimit(
  ctx: CfRequestContext,
  zoneId: string,
  ruleId: string,
  payload: RateLimitPayload
): Promise<CfRateLimit> {
  return cfResult<CfRateLimit>(ctx, {
    method: 'PUT',
    url: `/zones/${zoneId}/rate_limits/${ruleId}`,
    data: payload
  })
}

/** 删除：DELETE /zones/{zone_id}/rate_limits/{rule_id} */
export function deleteRateLimit(
  ctx: CfRequestContext,
  zoneId: string,
  ruleId: string
): Promise<{ id: string }> {
  return cfResult<{ id: string }>(ctx, {
    method: 'DELETE',
    url: `/zones/${zoneId}/rate_limits/${ruleId}`
  })
}

/* ------------------------------------------------------------------ */
/* 包涵空 responses 的兼容读取                                          */
/* ------------------------------------------------------------------ */

/** 统一读取某 zone 的 WAF 概览（规则数统计），供仪表盘 / 巡检使用 */
export async function getZoneWafSummary(
  ctx: CfRequestContext,
  zoneId: string
): Promise<{ accessRules: number; rateLimits: number; rulesets: number }> {
  const [access, limits, rulesets] = await Promise.all([
    listAccessRules(ctx, zoneId),
    listRateLimits(ctx, zoneId).catch(() => [] as CfRateLimit[]),
    listZoneRulesets(ctx, zoneId).catch(() => [] as CfRuleset[])
  ])
  return {
    accessRules: Array.isArray(access) ? access.length : 0,
    rateLimits: Array.isArray(limits) ? limits.length : 0,
    rulesets: Array.isArray(rulesets) ? rulesets.length : 0
  }
}
/**
 * WAF 安全规则接口（技术文档 §4.6）
 * - 托管规则集 Rulesets
 * - IP 访问规则（黑白名单）
 * - 速率限制 Rate Limits
 */
import { cfPaginate, cfRequest, cfResult, CfApiError, type CfRequestContext } from './client'
import type { CfAccessRule, CfRuleset } from '@/types'

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

/** 账号级列表：GET /accounts/{account_id}/firewall/access_rules/rules（账号级规则同样作用于该账号所有域名） */
export function listAccountAccessRules(
  ctx: CfRequestContext,
  accountId: string,
  query: { mode?: string; configuration_target?: string; configuration_value?: string } = {}
): Promise<CfAccessRule[]> {
  return cfPaginate<CfAccessRule>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/firewall/access_rules/rules`,
    params: { ...query, per_page: 100 },
    perPage: 100
  })
}

/** 账号级修改：PUT /accounts/{account_id}/firewall/access_rules/rules/{rule_id} */
export function updateAccountAccessRule(
  ctx: CfRequestContext,
  accountId: string,
  ruleId: string,
  payload: Partial<AccessRulePayload>
): Promise<CfAccessRule> {
  return cfResult<CfAccessRule>(ctx, {
    method: 'PUT',
    url: `/accounts/${accountId}/firewall/access_rules/rules/${ruleId}`,
    data: payload
  })
}

/** 账号级删除：DELETE /accounts/{account_id}/firewall/access_rules/rules/{rule_id} */
export function deleteAccountAccessRule(
  ctx: CfRequestContext,
  accountId: string,
  ruleId: string
): Promise<{ id: string }> {
  return cfResult<{ id: string }>(ctx, {
    method: 'DELETE',
    url: `/accounts/${accountId}/firewall/access_rules/rules/${ruleId}`
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
/* 旧版 /zones/{zone_id}/rate_limits 已废弃（410），改用 Rulesets API  */
/* 部署到 http_ratelimit 阶段入口 ruleset                               */
/* ------------------------------------------------------------------ */

export interface RateLimitRule {
  id?: string
  description?: string
  /** Rules 语言表达式，如 (http.host eq "example.com" and http.request.uri.path starts_with "/api/") */
  expression: string
  /** block / challenge / js_challenge / managed_challenge / log */
  action: string
  enabled?: boolean
  action_parameters?: Record<string, unknown>
  last_updated?: string
  ratelimit?: {
    characteristics?: string[]
    period?: number
    requests_per_period?: number
    mitigation_timeout?: number
  }
}

const RATE_LIMIT_PHASE = 'http_ratelimit'

/** 获取 http_ratelimit 阶段入口 ruleset；不存在（404）时返回 null */
export async function getRateLimitRuleset(
  ctx: CfRequestContext,
  zoneId: string
): Promise<{ id: string; rules: RateLimitRule[] } | null> {
  try {
    return await cfResult<{ id: string; rules: RateLimitRule[] }>(ctx, {
      method: 'GET',
      url: `/zones/${zoneId}/rulesets/phases/${RATE_LIMIT_PHASE}/entrypoint`
    })
  } catch (error) {
    if ((error as CfApiError).status === 404) return null
    throw error
  }
}

/** 列表：GET .../phases/http_ratelimit/entrypoint */
export async function listRateLimits(
  ctx: CfRequestContext,
  zoneId: string
): Promise<RateLimitRule[]> {
  const rs = await getRateLimitRuleset(ctx, zoneId)
  return (rs?.rules ?? []).filter((r) => r.ratelimit)
}

/** 新增规则（入口 ruleset 不存在时自动创建，将首条规则一并写入） */
export async function createRateLimit(
  ctx: CfRequestContext,
  zoneId: string,
  rule: Omit<RateLimitRule, 'id'>
): Promise<RateLimitRule> {
  const rs = await getRateLimitRuleset(ctx, zoneId)
  if (rs) {
    return cfResult<RateLimitRule>(ctx, {
      method: 'POST',
      url: `/zones/${zoneId}/rulesets/${rs.id}/rules`,
      data: rule
    })
  }
  // PUT 阶段入口可自动创建 entry point ruleset
  const created = await cfResult<{ rules?: RateLimitRule[] }>(ctx, {
    method: 'PUT',
    url: `/zones/${zoneId}/rulesets/phases/${RATE_LIMIT_PHASE}/entrypoint`,
    data: { rules: [rule as RateLimitRule] }
  })
  return created?.rules?.[0] ?? (rule as RateLimitRule)
}

/** 修改规则：PUT .../rulesets/{ruleset_id}/rules/{rule_id} */
export async function updateRateLimit(
  ctx: CfRequestContext,
  zoneId: string,
  ruleId: string,
  patch: Partial<RateLimitRule>
): Promise<RateLimitRule> {
  const rs = await getRateLimitRuleset(ctx, zoneId)
  if (!rs) throw new Error('速率限制规则集不存在，请先新增规则')
  return cfResult<RateLimitRule>(ctx, {
    method: 'PUT',
    url: `/zones/${zoneId}/rulesets/${rs.id}/rules/${ruleId}`,
    data: patch
  })
}

/** 删除规则：DELETE .../rulesets/{ruleset_id}/rules/{rule_id} */
export async function deleteRateLimit(
  ctx: CfRequestContext,
  zoneId: string,
  ruleId: string
): Promise<void> {
  const rs = await getRateLimitRuleset(ctx, zoneId)
  if (!rs) return
  await cfResult<unknown>(ctx, {
    method: 'DELETE',
    url: `/zones/${zoneId}/rulesets/${rs.id}/rules/${ruleId}`
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
    listRateLimits(ctx, zoneId).catch(() => [] as RateLimitRule[]),
    listZoneRulesets(ctx, zoneId).catch(() => [] as CfRuleset[])
  ])
  return {
    accessRules: Array.isArray(access) ? access.length : 0,
    rateLimits: Array.isArray(limits) ? limits.length : 0,
    rulesets: Array.isArray(rulesets) ? rulesets.length : 0
  }
}
/**
 * 统计监控接口（技术文档 §4.7）
 *
 * Cloudflare 已废弃 /zones/{id}/analytics/dashboard 与 /analytics/reports 等
 * 旧版 REST 接口（返回 400），此处统一改用 GraphQL Analytics API（POST /graphql）。
 * - 日粒度（1d）：httpRequests1dGroups，用于跨多日趋势
 * - 小时粒度（1h）：httpRequests1hGroups，用于短时间窗口
 */
import { cfRequest, type CfRequestContext } from './client'
import type { ZoneAnalyticsSummary, ZoneAnalyticsTimeseries } from '@/types'

const GRAPHQL_ENDPOINT = '/graphql'

export interface AnalyticsDateRange {
  since: string
  until: string
  /** 聚合粒度：1min / 15min / 1day 等，由时间跨度决定 */
  continuous?: boolean
}

function defaultRange(days = 7): AnalyticsDateRange {
  const until = new Date()
  const since = new Date(until.getTime() - days * 86400000)
  return {
    since: since.toISOString(),
    until: until.toISOString()
  }
}

interface GraphQLBody<T> {
  data?: T
  errors?: Array<{ message?: string }>
}

interface AnalyticsBucket {
  dimensions: { date?: string; datetime?: string }
  sum: { requests?: number; cachedRequests?: number; threats?: number; bytes?: number }
  uniq?: { uniques?: number }
}

interface ZoneAnalyticsGroups {
  httpRequests1dGroups?: AnalyticsBucket[]
  httpRequests1hGroups?: AnalyticsBucket[]
}

/** 发起 GraphQL 查询，返回 viewer.zones[0] 的统计分组 */
async function queryZoneAnalytics(
  ctx: CfRequestContext,
  query: string,
  variables: Record<string, unknown>
): Promise<ZoneAnalyticsGroups | undefined> {
  // GraphQL 响应体为 { data, errors }，并非 Cloudflare 通用 CfResponse 结构，此处直接读取原始 body
  const raw = (await cfRequest<unknown>(ctx, {
    method: 'POST',
    url: GRAPHQL_ENDPOINT,
    data: { query, variables },
    retries: 1,
    timeout: 30_000
  })) as unknown as GraphQLBody<{ viewer: { zones: ZoneAnalyticsGroups[] } }>
  if (raw.errors?.length || !raw.data) {
    const message = raw.errors?.map((e) => e.message ?? '').filter(Boolean).join('; ') || 'GraphQL 查询失败'
    throw new Error(message)
  }
  return raw.data.viewer?.zones?.[0]
}

const DAILY_QUERY = `
query ZoneHttpDaily($zoneTag: String!, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1dGroups(limit: 180, filter: { date_geq: $since, date_leq: $until }) {
        dimensions { date }
        sum { requests cachedRequests threats bytes }
        uniq { uniques }
      }
    }
  }
}`

const HOURLY_QUERY = `
query ZoneHttpHourly($zoneTag: String!, $since: Time!, $until: Time!) {
  viewer {
    zones(filter: { zoneTag: $zoneTag }) {
      httpRequests1hGroups(limit: 216, filter: { datetime_geq: $since, datetime_leq: $until }) {
        dimensions { datetime }
        sum { requests cachedRequests threats bytes }
        uniq { uniques }
      }
    }
  }
}`

function toTimeseries(bucket: AnalyticsBucket, isDaily: boolean): ZoneAnalyticsTimeseries {
  const stamp = isDaily ? (bucket.dimensions.date ?? '') : (bucket.dimensions.datetime ?? '')
  return {
    since: isDaily ? `${stamp}T00:00:00.000Z` : stamp,
    until: isDaily ? `${stamp}T23:59:59.999Z` : stamp,
    requests: {
      all: bucket.sum.requests ?? 0,
      cached: bucket.sum.cachedRequests ?? 0,
      threats: bucket.sum.threats ?? 0
    },
    threats: { all: bucket.sum.threats ?? 0 },
    bandwidth: { all: bucket.sum.bytes ?? 0, cached: 0 }
  }
}

function summarize(groups: AnalyticsBucket[], isDaily: boolean): { totals: ZoneAnalyticsSummary; timeseries: ZoneAnalyticsTimeseries[] } {
  const totals: ZoneAnalyticsSummary = {
    requests: { all: 0, cached: 0, http: 0, https: 0, threats: 0 },
    bandwidth: { all: 0, cached: 0 },
    threats: { all: 0 },
    uniques: { all: 0 }
  }
  const timeseries = groups.map((g) => toTimeseries(g, isDaily))
  for (const g of groups) {
    totals.requests.all += g.sum.requests ?? 0
    totals.requests.cached += g.sum.cachedRequests ?? 0
    totals.requests.threats += g.sum.threats ?? 0
    totals.threats.all += g.sum.threats ?? 0
    totals.bandwidth.all += g.sum.bytes ?? 0
    totals.uniques!.all += g.uniq?.uniques ?? 0
  }
  return { totals, timeseries }
}

async function fetchGroups(
  ctx: CfRequestContext,
  zoneId: string,
  range: AnalyticsDateRange,
  granularity: '1d' | '1h'
): Promise<AnalyticsBucket[]> {
  const vars = { zoneTag: zoneId, since: range.since, until: range.until }
  const data = await queryZoneAnalytics(ctx, granularity === '1d' ? DAILY_QUERY : HOURLY_QUERY, vars)
  return (granularity === '1d' ? data?.httpRequests1dGroups : data?.httpRequests1hGroups) ?? []
}

/** 仪表盘统计数据（默认近 24 小时，小时粒度） */
export async function getZoneDashboardAnalytics(
  ctx: CfRequestContext,
  zoneId: string,
  range: AnalyticsDateRange = defaultRange(1)
): Promise<{ totals: ZoneAnalyticsSummary; timeseries: ZoneAnalyticsTimeseries[] }> {
  const groups = await fetchGroups(ctx, zoneId, range, '1h')
  return summarize(groups, false)
}

/** 报表原始数据（默认近 30 天，日粒度） */
export async function getZoneAnalyticsReports(
  ctx: CfRequestContext,
  zoneId: string,
  range: AnalyticsDateRange = defaultRange(30)
): Promise<{ totals: ZoneAnalyticsSummary; timeseries: ZoneAnalyticsTimeseries[] }> {
  const groups = await fetchGroups(ctx, zoneId, range, '1d')
  return summarize(groups, true)
}

/** 单 zone 汇总统计（仅 totals），合并多个 zone 时聚合更快 */
export async function getZoneAnalyticsTotals(
  ctx: CfRequestContext,
  zoneId: string,
  days = 1
): Promise<ZoneAnalyticsSummary> {
  try {
    const groups = await fetchGroups(ctx, zoneId, defaultRange(days), '1d')
    return summarize(groups, true).totals
  } catch {
    return {
      requests: { all: 0, cached: 0, http: 0, https: 0, threats: 0 },
      bandwidth: { all: 0, cached: 0 },
      threats: { all: 0 }
    }
  }
}
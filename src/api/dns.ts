/**
 * DNS 解析记录接口（技术文档 §4.3）
 */
import { cfPaginate, cfResult, type CfRequestContext } from './client'
import type { CfDnsRecord, DnsRecordType } from '@/types'

export interface DnsRecordPayload {
  type: DnsRecordType | string
  name: string
  content: string
  ttl?: number
  proxied?: boolean
  priority?: number | null
  comment?: string | null
  tags?: string[]
  data?: Record<string, unknown>
}

/** 记录列表：GET /zones/{zone_id}/dns_records */
export function listDnsRecords(
  ctx: CfRequestContext,
  zoneId: string,
  query: { type?: string; name?: string; content?: string; search?: string } = {}
): Promise<CfDnsRecord[]> {
  return cfPaginate<CfDnsRecord>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/dns_records`,
    params: { ...query, per_page: 100 },
    perPage: 100
  })
}

/** 单条记录详情：GET /zones/{zone_id}/dns_records/{record_id} */
export function getDnsRecord(
  ctx: CfRequestContext,
  zoneId: string,
  recordId: string
): Promise<CfDnsRecord> {
  return cfResult<CfDnsRecord>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/dns_records/${recordId}`
  })
}

/** 新增记录：POST /zones/{zone_id}/dns_records */
export function createDnsRecord(
  ctx: CfRequestContext,
  zoneId: string,
  payload: DnsRecordPayload
): Promise<CfDnsRecord> {
  return cfResult<CfDnsRecord>(ctx, {
    method: 'POST',
    url: `/zones/${zoneId}/dns_records`,
    data: payload
  })
}

/** 修改记录：PATCH /zones/{zone_id}/dns_records/{record_id} */
export function updateDnsRecord(
  ctx: CfRequestContext,
  zoneId: string,
  recordId: string,
  payload: Partial<DnsRecordPayload>
): Promise<CfDnsRecord> {
  return cfResult<CfDnsRecord>(ctx, {
    method: 'PATCH',
    url: `/zones/${zoneId}/dns_records/${recordId}`,
    data: payload
  })
}

/** 删除记录：DELETE /zones/{zone_id}/dns_records/{record_id} */
export function deleteDnsRecord(
  ctx: CfRequestContext,
  zoneId: string,
  recordId: string
): Promise<{ id: string }> {
  return cfResult<{ id: string }>(ctx, {
    method: 'DELETE',
    url: `/zones/${zoneId}/dns_records/${recordId}`
  })
}

/** 批量新增（严格串行的轻接口，实际批量由 BatchService 并发调度） */
export async function createDnsRecords(
  ctx: CfRequestContext,
  zoneId: string,
  payloads: DnsRecordPayload[]
): Promise<CfDnsRecord[]> {
  const results: CfDnsRecord[] = []
  for (const payload of payloads) {
    results.push(await createDnsRecord(ctx, zoneId, payload))
  }
  return results
}
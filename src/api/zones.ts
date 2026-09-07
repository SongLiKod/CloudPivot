/**
 * 域名（Zone）管理接口（技术文档 §4.2）
 */
import { cfPaginate, cfResult, type CfRequestContext } from './client'
import type { CfZone } from '@/types'

export interface ZoneQuery {
  name?: string
  status?: string
  account_id?: string
  page?: number
  per_page?: number
}

/** 域名列表：GET /zones */
export function listZones(ctx: CfRequestContext, query: ZoneQuery = {}): Promise<CfZone[]> {
  return cfPaginate<CfZone>(ctx, {
    method: 'GET',
    url: '/zones',
    params: { ...query, per_page: query.per_page ?? 50 },
    perPage: query.per_page ?? 50
  })
}

/** 域名详情：GET /zones/{zone_id} */
export function getZone(ctx: CfRequestContext, zoneId: string): Promise<CfZone> {
  return cfResult<CfZone>(ctx, { method: 'GET', url: `/zones/${zoneId}` })
}

/** 新增域名托管：POST /zones */
export function createZone(
  ctx: CfRequestContext,
  payload: {
    name: string
    account: { id: string }
    type?: 'full' | 'partial'
    jump_start?: boolean
  }
): Promise<CfZone> {
  return cfResult<CfZone>(ctx, {
    method: 'POST',
    url: '/zones',
    data: { type: 'full', ...payload }
  })
}

/** 暂停 / 恢复域名：PATCH /zones/{zone_id} */
export function setZonePaused(
  ctx: CfRequestContext,
  zoneId: string,
  paused: boolean
): Promise<CfZone> {
  return cfResult<CfZone>(ctx, {
    method: 'PATCH',
    url: `/zones/${zoneId}`,
    data: { paused }
  })
}

/** 域名激活检查：PUT /zones/{zone_id}/activation_check */
export function activationCheck(ctx: CfRequestContext, zoneId: string): Promise<unknown> {
  return cfResult<unknown>(ctx, {
    method: 'PUT',
    url: `/zones/${zoneId}/activation_check`
  })
}

/** 删除域名：DELETE /zones/{zone_id} */
export function deleteZone(ctx: CfRequestContext, zoneId: string): Promise<{ id: string }> {
  return cfResult<{ id: string }>(ctx, { method: 'DELETE', url: `/zones/${zoneId}` })
}

/** 域名 DNS 锁定状态：GET /zones/{zone_id}/dnssec */
export function getZoneDnssec(ctx: CfRequestContext, zoneId: string): Promise<unknown> {
  return cfResult<unknown>(ctx, { method: 'GET', url: `/zones/${zoneId}/dnssec` })
}

/** 域名 SSL/TLS 证书状态：GET /zones/{zone_id}/ssl/certificate_packs */
export interface CertificatePack {
  id: string
  type: string
  primary_certificate?: string
  status?: string
  hosts?: string[]
}

export function listCertificatePacks(
  ctx: CfRequestContext,
  zoneId: string
): Promise<CertificatePack[]> {
  return cfResult<CertificatePack[]>(ctx, {
    method: 'GET',
    url: `/zones/${zoneId}/ssl/certificate_packs`,
    params: { status: 'all' }
  })
}

/** 域名 NS 记录（Registrar 域名才有注册信息）：GET /registrar/domains/{domain} */
export interface RegistrarDomain {
  id?: string
  name: string
  status?: string
  expires_at?: string
  created_at?: string
  locked?: boolean
  privacy_protection?: { enabled: boolean }
  registrar_status?: string
  zone?: { id: string }
}

export function getRegistrarDomain(
  ctx: CfRequestContext,
  domain: string
): Promise<RegistrarDomain> {
  return cfResult<RegistrarDomain>(ctx, {
    method: 'GET',
    url: `/registrar/domains/${encodeURIComponent(domain)}`
  })
}

/** 域名锁定 / 解锁：PUT /registrar/domains/{domain} */
export function setRegistrarDomainLock(
  ctx: CfRequestContext,
  domain: string,
  locked: boolean
): Promise<RegistrarDomain> {
  return cfResult<RegistrarDomain>(ctx, {
    method: 'PUT',
    url: `/registrar/domains/${encodeURIComponent(domain)}`,
    data: { locked }
  })
}

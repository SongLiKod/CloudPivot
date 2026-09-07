/**
 * 账号凭据在内存中的解密管理与上下文构建
 * 明文密钥仅存在于内存，请求结束后尽快弃用
 */
import { decryptText } from '@/utils/crypto'
import type { AccountCredential, CloudflareAccount } from '@/types'
import type { CfRequestContext } from '@/api/client'

/** 内存凭据缓存（key: accountId -> 明文凭据，仅本次运行期有效） */
const credentialCache = new Map<string, AccountCredential>()

export function cacheCredential(accountId: string, credential: AccountCredential) {
  credentialCache.set(accountId, credential)
}

export function getCachedCredential(accountId: string): AccountCredential | undefined {
  return credentialCache.get(accountId)
}

export function clearCredentialCache(accountId?: string) {
  if (accountId) credentialCache.delete(accountId)
  else credentialCache.clear()
}

/** 解密账号凭据（优先读缓存，避免频繁 AES-GCM 解密） */
export async function resolveCredential(
  account: CloudflareAccount
): Promise<AccountCredential> {
  const cached = credentialCache.get(account.id)
  if (cached) return cached

  const plain = await decryptText(account.credential)
  const credential: AccountCredential =
    account.authType === 'globalKey'
      ? JSON.parse(plain)
      : { authType: 'token', token: plain }

  // 内存缓存仅在会话内有效；token 为空时视为无效
  if (credential.token || credential.globalKey) {
    credentialCache.set(account.id, credential)
  }
  return credential
}

/** 为 Cloudflare API 请求构建上下文（注入账号归属与凭据） */
export async function buildRequestContext(
  account: CloudflareAccount
): Promise<CfRequestContext> {
  const credential = await resolveCredential(account)
  return {
    accountId: account.id,
    accountName: account.name,
    credential
  }
}

/** 会话失效时清空全部内存凭据 */
export function purgeSessionCredentials() {
  clearCredentialCache()
}
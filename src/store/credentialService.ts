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

  if (!account.credential?.cipher || !account.credential?.iv) {
    throw new Error(`账号「${account.name}」缺少凭据，请先配置密钥`)
  }

  try {
    const plain = await decryptText(account.credential)
    const credential: AccountCredential =
      account.authType === 'globalKey'
        ? JSON.parse(plain)
        : { authType: 'token', token: plain }

    if (credential.authType === 'token') {
      if (!credential.token) {
        throw new Error(`账号「${account.name}」API Token 为空，请重新配置`)
      }
    } else {
      if (!credential.email || !credential.globalKey) {
        throw new Error(`账号「${account.name}」邮箱或 Global Key 为空，请重新配置`)
      }
    }

    credentialCache.set(account.id, credential)
    return credential
  } catch (error) {
    const msg = (error as Error).message || ''
    if (msg.includes('主密钥校验失败') || msg.includes('加密数据格式不正确')) {
      throw new Error(`账号「${account.name}」凭据解密失败，可能来自其他设备或密钥已损坏`)
    }
    throw error
  }
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
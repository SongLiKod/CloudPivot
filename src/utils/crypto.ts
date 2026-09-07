/**
 * 本地加密模块：AES-256-GCM
 *
 * 安全约束（技术文档 §7）：
 * 1. API 密钥仅以密文形式持久化，任何界面与日志禁止输出明文；
 * 2. 主密钥首次运行时随机生成并保存在本地 IndexedDB，不上传任何服务器；
 * 3. 内存中解密后的凭据对象用完即弃，调用方应尽快释放引用。
 */
import type { EncryptedPayload } from '@/types'

const ALG = 'AES-GCM'
const KEY_VERSION = 1
const IV_BYTES = 12
const MASTER_KEY_CONFIG_ID = '__master_key__'

/* ------------------------------------------------------------------ */
/* 底层工具                                                            */
/* ------------------------------------------------------------------ */

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle
  if (!subtle) {
    throw new Error(
      '当前运行环境不支持 Web Crypto（需要 HTTPS 或本地安全上下文），无法进行密钥加密存储。'
    )
  }
  return subtle
}

export function toBase64(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** 生成随机 id（不依赖 uuid 库） */
export function randomId(prefix = ''): string {
  const bytes = new Uint8Array(12)
  globalThis.crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
  return `${prefix}${prefix ? '_' : ''}${Date.now().toString(36)}${hex}`
}

/** SHA-256 摘要（用于日志防篡改哈希链） */
export async function sha256Hex(input: string): Promise<string> {
  const digest = await getSubtle().digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/* ------------------------------------------------------------------ */
/* 主密钥管理                                                          */
/* ------------------------------------------------------------------ */

let cachedKey: CryptoKey | null = null
let masterKeyProvider: (() => Promise<EncryptedPayload | null>) | null = null
let masterKeyPersister: ((payload: EncryptedPayload) => Promise<void>) | null = null

/**
 * 注入主密钥的持久化通道（由 store 层在初始化时绑定 IndexedDB）
 * 避免 utils 直接依赖具体存储实现，便于测试与替换
 */
export function registerMasterKeyStorage(provider: {
  load: () => Promise<EncryptedPayload | null>
  save: (payload: EncryptedPayload) => Promise<void>
}) {
  masterKeyProvider = provider.load
  masterKeyPersister = provider.save
}

/**
 * 主密钥自身也使用随机 device secret 加密后保存，
 * 形成"随机密钥 + 本地密文"的双层保护，防止直接读取 IndexedDB 得到可用密钥。
 */
async function loadOrCreateMasterKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey

  const subtle = getSubtle()
  const stored = masterKeyProvider ? await masterKeyProvider() : null

  // device secret 保存在 localStorage（与 IndexedDB 分离存储）
  const DEVICE_SECRET_KEY = 'cloudpivot-device-secret'
  let deviceSecret = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_SECRET_KEY) : null
  if (!deviceSecret) {
    const bytes = new Uint8Array(32)
    globalThis.crypto.getRandomValues(bytes)
    deviceSecret = toBase64(bytes)
    try {
      localStorage.setItem(DEVICE_SECRET_KEY, deviceSecret)
    } catch {
      /* 隐私模式下可能写入失败，降级为仅内存持有 */
    }
  }

  const deriveKey = async (secretBase64: string): Promise<CryptoKey> => {
    const raw = fromBase64(secretBase64)
    const rawBuf = new Uint8Array(raw)
    const baseKey = await subtle.importKey('raw', rawBuf, 'PBKDF2', false, ['deriveKey'])
    return subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: new TextEncoder().encode('cloudpivot::master::v1'),
        iterations: 120000,
        hash: 'SHA-256'
      },
      baseKey,
      { name: ALG, length: 256 },
      true,
      ['encrypt', 'decrypt']
    )
  }

  if (stored) {
    try {
      const wrapperKey = await deriveKey(deviceSecret)
      const plainBytes = await subtle.decrypt(
        { name: ALG, iv: fromBase64(stored.iv) as BufferSource },
        wrapperKey,
        fromBase64(stored.cipher) as BufferSource
      )
      cachedKey = await subtle.importKey('raw', plainBytes, ALG, false, ['encrypt', 'decrypt'])
      return cachedKey
    } catch {
      // 密文与本机 device secret 不匹配（如备份文件来自其它设备）
      throw new Error('本地主密钥校验失败：数据可能来自其它设备，或本地密钥存储已损坏。')
    }
  }

  // 首次运行：生成主密钥并使用 device secret 包装后落盘
  const rawMaster = globalThis.crypto.getRandomValues(new Uint8Array(32))
  cachedKey = await subtle.importKey('raw', rawMaster, ALG, false, ['encrypt', 'decrypt'])

  if (masterKeyPersister) {
    const wrapperKey = await deriveKey(deviceSecret)
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const wrapped = await subtle.encrypt({ name: ALG, iv }, wrapperKey, rawMaster)
    await masterKeyPersister({
      cipher: toBase64(wrapped),
      iv: toBase64(iv),
      alg: ALG,
      kv: KEY_VERSION
    })
  }

  // 主动清空原始密钥字节引用
  rawMaster.fill(0)
  return cachedKey
}

/* ------------------------------------------------------------------ */
/* 加解密 API                                                          */
/* ------------------------------------------------------------------ */

/** 加密任意可序列化数据，返回密文载荷 */
export async function encryptJSON<T>(data: T): Promise<EncryptedPayload> {
  const subtle = getSubtle()
  const key = await loadOrCreateMasterKey()
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const plain = new TextEncoder().encode(JSON.stringify(data))
  const cipher = await subtle.encrypt({ name: ALG, iv }, key, plain)
  // 明文缓冲尽快释放
  plain.fill(0)
  return { cipher: toBase64(cipher), iv: toBase64(iv), alg: ALG, kv: KEY_VERSION }
}

/** 加密字符串（API Token / Global Key 场景） */
export async function encryptText(text: string): Promise<EncryptedPayload> {
  return encryptJSON({ __t: 'str', v: text })
}

/** 解密载荷，返回原始 JSON */
export async function decryptJSON<T>(payload: EncryptedPayload): Promise<T> {
  const subtle = getSubtle()
  const key = await loadOrCreateMasterKey()
  if (!payload?.cipher || !payload?.iv) {
    throw new Error('加密数据格式不正确')
  }
  const plainBuffer = await subtle.decrypt(
    { name: payload.alg || ALG, iv: fromBase64(payload.iv) as BufferSource },
    key,
    fromBase64(payload.cipher) as BufferSource
  )
  return JSON.parse(new TextDecoder().decode(plainBuffer)) as T
}

/** 解密字符串 */
export async function decryptText(payload: EncryptedPayload): Promise<string> {
  const data = await decryptJSON<{ __t: string; v: string }>(payload)
  return data?.v ?? ''
}

/**
 * 生成密钥摘要（用于界面展示，绝不含可还原信息）
 * 例：`v1.abcdef12****`
 */
export function maskSecret(secret: string): string {
  if (!secret) return ''
  const head = secret.slice(0, 4)
  const tail = secret.slice(-4)
  return `${head}${'*'.repeat(Math.max(4, Math.min(12, secret.length - 8)))}${tail}`
}

/** 清空内存中的敏感字段（就地置空） */
export function wipeObject(obj: Record<string, unknown> | null | undefined) {
  if (!obj) return
  for (const key of Object.keys(obj)) {
    const value = obj[key]
    if (typeof value === 'string') obj[key] = ''
    else if (value && typeof value === 'object') wipeObject(value as Record<string, unknown>)
  }
}

export const CRYPTO_META = {
  alg: ALG,
  keyVersion: KEY_VERSION,
  ivBytes: IV_BYTES,
  masterKeyConfigId: MASTER_KEY_CONFIG_ID
}

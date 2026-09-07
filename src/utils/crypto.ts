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

export type MasterKeyLockMode = 'device' | 'pin'

/**
 * 主密钥包装密钥的来源：
 * - device：使用随机 device secret（默认，未启用应用锁或未开启「口令加固」）
 * - pin：使用用户口令经 PBKDF2 派生（应用锁「口令加固」），仅在解锁后可用
 */
export interface MasterKeyLockProvider {
  /** 返回用于派生包装密钥的 base secret；锁定或未就绪时返回 null */
  getBaseSecret(): Promise<string | null>
}

let lockProvider: MasterKeyLockProvider | null = null
let wrapModeProvider: { load(): Promise<MasterKeyLockMode>; save(mode: MasterKeyLockMode): Promise<void> } | null = null

/** 注入主密钥包装密钥来源（由 lockService 提供） */
export function registerMasterKeyLock(provider: MasterKeyLockProvider) {
  lockProvider = provider
}

/** 注入当前主密钥包装方式（device / pin）的持久化通道 */
export function registerMasterKeyWrapModeStorage(provider: {
  load(): Promise<MasterKeyLockMode>
  save(mode: MasterKeyLockMode): Promise<void>
}) {
  wrapModeProvider = provider
}

/** 锁定状态下请求主密钥会抛出该错误，调用方据此跳过敏感操作 */
export class LockRequiredError extends Error {
  constructor() {
    super('应用已锁定')
    this.name = 'LockRequiredError'
  }
}

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

/** device secret 保存在 localStorage（与 IndexedDB 分离存储） */
const DEVICE_SECRET_KEY = 'cloudpivot-device-secret'
function getOrCreateDeviceSecret(): string {
  let secret = typeof localStorage !== 'undefined' ? localStorage.getItem(DEVICE_SECRET_KEY) : null
  if (!secret) {
    const bytes = new Uint8Array(32)
    globalThis.crypto.getRandomValues(bytes)
    secret = toBase64(bytes)
    try {
      localStorage.setItem(DEVICE_SECRET_KEY, secret)
    } catch {
      /* 隐私模式下可能写入失败，降级为仅内存持有 */
    }
  }
  return secret
}

const PBKDF2_ITERS = 120000
const LOCK_WRAP_SALT = new TextEncoder().encode('cloudpivot::lockwrap::v1')

/** 由 base secret 派生主密钥包装密钥 */
async function deriveWrapperKey(secret: string, mode: MasterKeyLockMode): Promise<CryptoKey> {
  const subtle = getSubtle()
  const raw = mode === 'device' ? fromBase64(secret) : new TextEncoder().encode(secret)
  const baseKey = await subtle.importKey('raw', new Uint8Array(raw), 'PBKDF2', false, [
    'deriveKey'
  ])
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: LOCK_WRAP_SALT, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    baseKey,
    { name: ALG, length: 256 },
    true,
    ['encrypt', 'decrypt']
  )
}

/** 依据存储的包装方式取得当前包装密钥上下文 */
async function getCurrentWrapperContext(): Promise<{ mode: MasterKeyLockMode; secret: string }> {
  const mode = wrapModeProvider ? await wrapModeProvider.load() : 'device'
  if (mode === 'pin') {
    const secret = lockProvider ? await lockProvider.getBaseSecret() : null
    if (secret === null) throw new LockRequiredError()
    return { mode: 'pin', secret }
  }
  return { mode: 'device', secret: getOrCreateDeviceSecret() }
}

/**
 * 主密钥自身也使用包装密钥（device secret 或口令派生）加密后保存，
 * 形成"随机密钥 + 本地密文"的双层保护，防止直接读取 IndexedDB 得到可用密钥。
 */
async function loadOrCreateMasterKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey

  const subtle = getSubtle()
  const stored = masterKeyProvider ? await masterKeyProvider() : null

  if (stored) {
    const ctx = await getCurrentWrapperContext() // 锁定且未解锁（pin 模式）时抛 LockRequiredError
    const wrapperKey = await deriveWrapperKey(ctx.secret, ctx.mode)
    try {
      const plainBytes = await subtle.decrypt(
        { name: ALG, iv: fromBase64(stored.iv) as BufferSource },
        wrapperKey,
        fromBase64(stored.cipher) as BufferSource
      )
      const raw = new Uint8Array(plainBytes)
      cachedKey = await subtle.importKey('raw', raw, ALG, false, ['encrypt', 'decrypt'])
      raw.fill(0)
      return cachedKey
    } catch {
      // 密文与当前包装密钥不匹配（如备份文件来自其它设备）
      throw new Error('本地主密钥校验失败：数据可能来自其它设备，或本地密钥存储已损坏。')
    }
  }

  // 首次运行：生成主密钥并使用当前包装密钥落盘
  const rawMaster = globalThis.crypto.getRandomValues(new Uint8Array(32))
  cachedKey = await subtle.importKey('raw', rawMaster, ALG, false, ['encrypt', 'decrypt'])

  if (masterKeyPersister) {
    const ctx = await getCurrentWrapperContext()
    const wrapperKey = await deriveWrapperKey(ctx.secret, ctx.mode)
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const wrapped = await subtle.encrypt({ name: ALG, iv }, wrapperKey, rawMaster)
    await masterKeyPersister({
      cipher: toBase64(wrapped),
      iv: toBase64(iv),
      alg: ALG,
      kv: KEY_VERSION
    })
    if (wrapModeProvider) await wrapModeProvider.save(ctx.mode)
  }

  // 主动清空原始密钥字节引用
  rawMaster.fill(0)
  return cachedKey
}

/**
 * 更换主密钥包装方式（device <-> pin）。
 * 用于启用/关闭「口令加固」或修改口令后重包主密钥。
 */
export async function rewrapMasterKey(
  mode: MasterKeyLockMode,
  pinSecret?: string
): Promise<void> {
  const subtle = getSubtle()
  const stored = masterKeyProvider ? await masterKeyProvider() : null
  if (!stored) throw new Error('主密钥尚未初始化')

  // 用当前包装密钥解密出原始主密钥字节
  const curCtx = await getCurrentWrapperContext()
  const curWrapper = await deriveWrapperKey(curCtx.secret, curCtx.mode)
  let raw: Uint8Array
  try {
    const plain = await subtle.decrypt(
      { name: ALG, iv: fromBase64(stored.iv) as BufferSource },
      curWrapper,
      fromBase64(stored.cipher) as BufferSource
    )
    raw = new Uint8Array(plain)
  } catch {
    throw new Error('无法解密当前主密钥，请先解锁后重试')
  }

  // 用新包装密钥重新加密并落盘
  const newSecret = mode === 'pin' ? (pinSecret ?? '') : getOrCreateDeviceSecret()
  const newWrapper = await deriveWrapperKey(newSecret, mode)
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const wrapped = await subtle.encrypt({ name: ALG, iv }, newWrapper, raw as BufferSource)
  if (masterKeyPersister) {
    await masterKeyPersister({
      cipher: toBase64(wrapped),
      iv: toBase64(iv),
      alg: ALG,
      kv: KEY_VERSION
    })
  }
  if (wrapModeProvider) await wrapModeProvider.save(mode)
  raw.fill(0)
  cachedKey = null // 下次按新模式重新加载
}

/** 生成口令的加盐 PBKDF2 校验值（仅存散列，不存明文/包装密钥） */
export async function hashPin(pin: string): Promise<{ salt: string; verifier: string }> {
  const subtle = getSubtle()
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
  const baseKey = await subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits'
  ])
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    baseKey,
    256
  )
  return { salt: toBase64(salt), verifier: toBase64(new Uint8Array(bits)) }
}

/**
 * 重建主密钥并使用新口令包装（用于口令加固模式下「忘记口令」重置）。
 * 原主密钥包装密钥已随旧口令丢失，无法解开，故重新生成；旧加密凭据将无法解密。
 */
export async function resetMasterKey(pin: string): Promise<void> {
  const subtle = getSubtle()
  const rawMaster = globalThis.crypto.getRandomValues(new Uint8Array(32))
  const key = await subtle.importKey('raw', rawMaster, ALG, false, ['encrypt', 'decrypt'])
  if (masterKeyPersister) {
    const wrapperKey = await deriveWrapperKey(pin, 'pin')
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES))
    const wrapped = await subtle.encrypt({ name: ALG, iv }, wrapperKey, rawMaster)
    await masterKeyPersister({
      cipher: toBase64(wrapped),
      iv: toBase64(iv),
      alg: ALG,
      kv: KEY_VERSION
    })
  }
  if (wrapModeProvider) await wrapModeProvider.save('pin')
  cachedKey = key
  rawMaster.fill(0)
}

/** 校验口令是否与已存散列匹配 */
export async function verifyPinHash(
  pin: string,
  saltBase64: string,
  verifierBase64: string
): Promise<boolean> {
  const subtle = getSubtle()
  const baseKey = await subtle.importKey(
    'raw',
    new TextEncoder().encode(pin),
    'PBKDF2',
    false,
    ['deriveBits']
  )
  const bits = await subtle.deriveBits(
    { name: 'PBKDF2', salt: fromBase64(saltBase64) as BufferSource, iterations: PBKDF2_ITERS, hash: 'SHA-256' },
    baseKey,
    256
  )
  return toBase64(new Uint8Array(bits)) === verifierBase64
}

/* ------------------------------------------------------------------ */
/* 加解密 API                                                          */
/* ------------------------------------------------------------------ */

/** 预热主密钥缓存（用于解锁后立即加载，确保口令加固模式下可解密） */
export async function getOrWarmMasterKey(): Promise<void> {
  await loadOrCreateMasterKey()
}

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

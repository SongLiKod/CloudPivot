/**
 * 应用锁服务
 *
 * - PIN（口令）锁屏：启动 / 后台回前台 / 空闲 / 失焦时锁定
 * - 口令经 PBKDF2 加盐散列存储（不存明文、不存包装密钥）
 * - 「口令加固」：用口令派生密钥包装主密钥，锁定时无法解密任何凭据（数据级锁定）
 * - 失败次数限制 + 冷却，防暴力尝试
 */
import { reactive } from 'vue'
import { getConfig, setConfig } from '@/utils/db'
import {
  hashPin,
  verifyPinHash,
  rewrapMasterKey,
  registerMasterKeyLock,
  registerMasterKeyWrapModeStorage,
  type MasterKeyLockMode
} from '@/utils/crypto'
import { App as CapacitorApp } from '@capacitor/app'
import { isAndroid, isElectron } from '@/utils/platform'
import { purgeSessionCredentials } from '@/store/credentialService'

const LOCK_CONFIG_KEY = '__app_lock__'
const PIN_RECORD_KEY = '__app_pin__'
const WRAP_MODE_KEY = '__master_wrap__'
const PIN_RESET_KEY = '__pin_reset_otp__'

const OTP_TTL_MS = 10 * 60 * 1000

export interface LockSettings {
  enabled: boolean
  hardenMasterKey: boolean
  autoLockIdleMinutes: number // 0 = 关闭
  autoLockOnBlur: boolean
  autoLockOnBackground: boolean
  failLimit: number
  cooldownSeconds: number
  pinSet: boolean
}

const DEFAULT_SETTINGS: LockSettings = {
  enabled: false,
  hardenMasterKey: false,
  autoLockIdleMinutes: 0,
  autoLockOnBlur: true,
  autoLockOnBackground: true,
  failLimit: 5,
  cooldownSeconds: 30,
  pinSet: false
}

interface PinRecord {
  salt: string
  verifier: string
}

export const lockState = reactive({
  enabled: false,
  pinSet: false,
  hardenMasterKey: false,
  locked: false,
  failCount: 0,
  cooldownUntil: 0,
  autoLockIdleMinutes: 0,
  autoLockOnBlur: true,
  autoLockOnBackground: true,
  failLimit: 5,
  cooldownSeconds: 30
})

/** 解锁后暂存于内存的口令（仅用于派生主密钥包装密钥，锁定时清空） */
let sessionPin: string | null = null
let pinRecord: PinRecord | null = null
let idleTimer: ReturnType<typeof setInterval> | null = null
let lastActivityAt = Date.now()
let wasHidden = false
const unlockHandlers: Array<() => void> = []

function persistSettings(settings: LockSettings): Promise<void> {
  return setConfig(LOCK_CONFIG_KEY, settings)
}

async function loadSettings(): Promise<LockSettings> {
  const saved = await getConfig<LockSettings>(LOCK_CONFIG_KEY, DEFAULT_SETTINGS)
  return { ...DEFAULT_SETTINGS, ...saved }
}

function applyState(settings: LockSettings) {
  lockState.enabled = settings.enabled
  lockState.pinSet = settings.pinSet
  lockState.hardenMasterKey = settings.hardenMasterKey
  lockState.autoLockIdleMinutes = settings.autoLockIdleMinutes
  lockState.autoLockOnBlur = settings.autoLockOnBlur
  lockState.autoLockOnBackground = settings.autoLockOnBackground
  lockState.failLimit = settings.failLimit
  lockState.cooldownSeconds = settings.cooldownSeconds
}

/** 注入主密钥包装密钥来源与包装方式存储通道 */
function registerCryptoHooks() {
  registerMasterKeyLock({
    async getBaseSecret() {
      return lockState.locked ? null : sessionPin
    }
  })
  registerMasterKeyWrapModeStorage({
    async load(): Promise<MasterKeyLockMode> {
      const mode = await getConfig<MasterKeyLockMode>(WRAP_MODE_KEY, 'device')
      return mode === 'pin' ? 'pin' : 'device'
    },
    async save(mode: MasterKeyLockMode) {
      await setConfig(WRAP_MODE_KEY, mode)
    }
  })
}

/** 应用锁是否处于激活状态（需在启动时决定是否展示锁屏） */
export function isLockActive(): boolean {
  return lockState.enabled && lockState.pinSet
}

export function isLocked(): boolean {
  return lockState.locked
}

/** 锁定后清空内存口令，使主密钥无法解密（口令加固时真正锁死数据） */
export function lock(): void {
  if (!lockState.enabled) return
  lockState.locked = true
  lockState.failCount = 0
  sessionPin = null
  // 同时清空内存中的明文凭据缓存，避免“仅 UI 锁定”后凭据仍被复用
  purgeSessionCredentials()
}

/** 解锁：设置会话口令并执行待办初始化 */
export function unlock(): void {
  lockState.locked = false
  lockState.failCount = 0
  lockState.cooldownUntil = 0
  // 校验通过后由 verifyAndUnlock 设置 sessionPin；此处仅复位状态
}

async function ensureSessionPin(pin: string) {
  sessionPin = pin
  // 口令加固模式下，解锁时缓存主密钥（立即派生包装密钥解密）
  if (lockState.hardenMasterKey) {
    const { getOrWarmMasterKey } = await import('@/utils/crypto')
    await getOrWarmMasterKey()
  }
}

/**
 * 校验口令并解锁。返回 { ok, reason }
 * reason: 'cooldown' | 'wrong' | 'ok'
 */
export async function verifyAndUnlock(
  pin: string
): Promise<{ ok: boolean; reason: 'cooldown' | 'wrong' | 'ok' }> {
  if (lockState.cooldownUntil > Date.now()) return { ok: false, reason: 'cooldown' }
  if (!pinRecord) return { ok: false, reason: 'wrong' }
  const ok = await verifyPinHash(pin, pinRecord.salt, pinRecord.verifier)
  if (!ok) {
    lockState.failCount += 1
    if (lockState.failCount >= lockState.failLimit) {
      lockState.cooldownUntil = Date.now() + lockState.cooldownSeconds * 1000
      lockState.failCount = 0
    }
    return { ok: false, reason: 'wrong' }
  }
  lockState.locked = false
  lockState.failCount = 0
  lockState.cooldownUntil = 0
  await ensureSessionPin(pin)
  flushUnlockHandlers()
  return { ok: true, reason: 'ok' }
}

function flushUnlockHandlers() {
  const handlers = unlockHandlers.splice(0)
  for (const fn of handlers) {
    try {
      fn()
    } catch (e) {
      console.warn('[CloudPivot] unlock handler error:', e)
    }
  }
}

/** 敏感操作二次确认：校验口令但不改变锁定状态（导出含密钥备份等） */
export async function confirmPin(pin: string): Promise<boolean> {
  if (!pinRecord) return true
  return verifyPinHash(pin, pinRecord.salt, pinRecord.verifier)
}

/* ------------------------------------------------------------------ */
/* 忘记口令（邮件验证码重置）                                           */
/* ------------------------------------------------------------------ */

function maskEmail(email: string): string {
  const idx = email.indexOf('@')
  if (idx <= 1) return email
  return `${email.slice(0, 1)}${'*'.repeat(Math.min(4, idx - 1))}${email.slice(idx)}`
}

/** 向配置邮箱发送一次性验证码（10 分钟有效） */
export async function requestPinResetEmail(): Promise<{
  ok: boolean
  message: string
  to?: string
}> {
  if (!lockState.pinSet) return { ok: false, message: '尚未设置口令' }
  const { getEmailSettings, sendOtpEmail } = await import('@/utils/emailService')
  const email = await getEmailSettings()
  if (!email.enabled || !email.recipient || !email.serviceId || !email.templateId || !email.publicKey) {
    return { ok: false, message: '未配置邮箱提醒，无法通过邮箱重置口令（请在设置中开启）' }
  }
  const code = String(Math.floor(100000 + Math.random() * 900000))
  await setConfig(PIN_RESET_KEY, { code, expiresAt: Date.now() + OTP_TTL_MS })
  try {
    await sendOtpEmail(code)
  } catch (error) {
    await setConfig(PIN_RESET_KEY, null)
    return { ok: false, message: `验证码邮件发送失败：${(error as Error).message}` }
  }
  return { ok: true, message: '验证码已发送', to: maskEmail(email.recipient) }
}

/** 凭验证码重置口令；口令加固模式下会重建主密钥（旧加密凭据需重新配置） */
export async function submitPinReset(
  otp: string,
  newPin: string
): Promise<{ ok: boolean; message: string }> {
  if (newPin.length < 4) return { ok: false, message: '口令至少 4 位' }
  const record = await getConfig<{ code: string; expiresAt: number } | null>(PIN_RESET_KEY, null)
  if (!record || record.code !== otp.trim() || Date.now() > record.expiresAt) {
    return { ok: false, message: '验证码错误或已过期，请重新获取' }
  }
  await setConfig(PIN_RESET_KEY, null)

  const ph = await hashPin(newPin)
  pinRecord = ph
  await setConfig(PIN_RECORD_KEY, ph)
  sessionPin = newPin

  if (lockState.hardenMasterKey) {
    const { resetMasterKey } = await import('@/utils/crypto')
    await resetMasterKey(newPin)
    const { useAccountStore } = await import('@/store/useAccountStore')
    await useAccountStore().invalidateCredentials(
      '口令已重置且主密钥重建，请重新配置各账号 API 凭据'
    )
  }

  lockState.locked = false
  lockState.failCount = 0
  lockState.cooldownUntil = 0
  if (lockState.hardenMasterKey) {
    await ensureSessionPin(newPin) // 立即用新口令加载主密钥
  }
  flushUnlockHandlers()
  return { ok: true, message: '口令已重置，请使用新口令解锁' }
}

/** 注册解锁后回调（用于延迟初始化数据/同步）；若已解锁则立即执行 */
export function whenUnlocked(cb: () => void): void {
  if (!lockState.locked) {
    cb()
    return
  }
  unlockHandlers.push(cb)
}

/* ------------------------------------------------------------------ */
/* 管理操作                                                            */
/* ------------------------------------------------------------------ */

export async function enableLock(pin: string, harden = false): Promise<void> {
  const min = 4
  if (pin.length < min) throw new Error(`口令至少 ${min} 位`)
  const record = await hashPin(pin)
  pinRecord = record
  await setConfig(PIN_RECORD_KEY, record)

  if (harden) {
    // 当前为 device 包装 -> 切到 pin 包装（本会话已解锁，可用新口令重包）
    await rewrapMasterKey('pin', pin)
  }

  const settings: LockSettings = {
    ...(await loadSettings()),
    enabled: true,
    pinSet: true,
    hardenMasterKey: harden
  }
  await persistSettings(settings)
  applyState(settings)
  lockState.locked = false
  sessionPin = pin
}

export async function changePin(oldPin: string, newPin: string): Promise<void> {
  if (newPin.length < 4) throw new Error('口令至少 4 位')
  if (oldPin === newPin) throw new Error('新口令不能与旧口令相同')
  if (!pinRecord) throw new Error('尚未设置口令')
  const ok = await verifyPinHash(oldPin, pinRecord.salt, pinRecord.verifier)
  if (!ok) throw new Error('原口令不正确')

  const record = await hashPin(newPin)
  pinRecord = record
  await setConfig(PIN_RECORD_KEY, record)

  if (lockState.hardenMasterKey) {
    await rewrapMasterKey('pin', newPin)
    sessionPin = newPin
  }
}

export async function disableLock(confirmPin: string): Promise<void> {
  if (!pinRecord) throw new Error('尚未设置口令')
  const ok = await verifyPinHash(confirmPin, pinRecord.salt, pinRecord.verifier)
  if (!ok) throw new Error('口令不正确')

  if (lockState.hardenMasterKey) {
    await rewrapMasterKey('device')
  }

  await setConfig(PIN_RECORD_KEY, null)
  pinRecord = null
  sessionPin = null
  const settings: LockSettings = { ...(await loadSettings()), enabled: false, pinSet: false, hardenMasterKey: false }
  await persistSettings(settings)
  applyState(settings)
  lockState.locked = false
}

export async function setHardenMasterKey(enabled: boolean): Promise<void> {
  if (enabled && !lockState.pinSet) throw new Error('请先设置口令')
  if (enabled) {
    if (!sessionPin) throw new Error('请先解锁后开启口令加固')
    await rewrapMasterKey('pin', sessionPin)
  } else {
    await rewrapMasterKey('device')
    sessionPin = null
  }
  const settings: LockSettings = { ...(await loadSettings()), hardenMasterKey: enabled }
  await persistSettings(settings)
  applyState(settings)
}

export async function updateLockRules(patch: Partial<Omit<LockSettings, 'enabled' | 'pinSet' | 'hardenMasterKey'>>): Promise<void> {
  const settings: LockSettings = { ...(await loadSettings()), ...patch }
  await persistSettings(settings)
  applyState(settings)
}

/* ------------------------------------------------------------------ */
/* 自动锁定                                                            */
/* ------------------------------------------------------------------ */

function onUserActivity() {
  lastActivityAt = Date.now()
}

function registerIdleCheck() {
  stopIdleCheck()
  if (!lockState.enabled || lockState.autoLockIdleMinutes <= 0) return
  idleTimer = setInterval(() => {
    if (lockState.locked) return
    const idleMs = Date.now() - lastActivityAt
    if (idleMs >= lockState.autoLockIdleMinutes * 60_000) lock()
  }, 30_000)
}

function stopIdleCheck() {
  if (idleTimer) {
    clearInterval(idleTimer)
    idleTimer = null
  }
}

function registerVisibilityAutoLock() {
  if (typeof document === 'undefined') return
  document.addEventListener('visibilitychange', () => {
    const hidden = document.visibilityState === 'hidden'
    if (hidden) wasHidden = true
    else if (wasHidden) {
      wasHidden = false
      if (lockState.enabled && lockState.autoLockOnBackground && !lockState.locked) lock()
    }
  })
}

function registerBlurAutoLock() {
  if (!isElectron || typeof window === 'undefined') return
  window.addEventListener('blur', () => {
    if (lockState.enabled && lockState.autoLockOnBlur && !lockState.locked) lock()
  })
}

function registerAndroidAutoLock() {
  if (!isAndroid) return
  void CapacitorApp.addListener('appStateChange', (state) => {
    if (state.isActive && lockState.enabled && lockState.autoLockOnBackground && !lockState.locked) {
      lock()
    }
  })
}

/** 初始化应用锁：加载配置、注册钩子、绑定自动锁定事件 */
export async function initLock(): Promise<void> {
  const settings = await loadSettings()
  pinRecord = await getConfig<PinRecord | null>(PIN_RECORD_KEY, null)
  applyState(settings)
  registerCryptoHooks()

  if (lockState.enabled && lockState.pinSet) {
    lockState.locked = true
    sessionPin = null
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    ;['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((evt) =>
      window.addEventListener(evt, onUserActivity, { passive: true })
    )
  }
  registerIdleCheck()
  registerVisibilityAutoLock()
  registerBlurAutoLock()
  registerAndroidAutoLock()
}

/** 设置变更后由外部调用以重建空闲检测 */
export function refreshAutoLockRules(): void {
  registerIdleCheck()
}

export function disposeLock(): void {
  stopIdleCheck()
}

export function lockPinSet(): boolean {
  return lockState.pinSet
}

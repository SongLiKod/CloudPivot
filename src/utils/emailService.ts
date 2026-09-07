/**
 * 邮件提醒服务（口令备份）
 *
 * 通过 EmailJS（浏览器客户端邮件服务）发送提醒邮件，可发送到任意邮箱（QQ / Outlook / Gmail 等）。
 * EmailJS 专为浏览器/WebView 客户端设计，无 CORS 限制（Resend 等 REST API 会拦截浏览器跨域请求）。
 *
 * 使用前需在 emailjs.com 配置：
 *  - 一个 Service（连接你的发信邮箱，如 QQ / Outlook / Gmail / 通用 SMTP）
 *  - 一个 Template（正文使用变量，如 {{message}}、{{subject}}、{{to_email}}）
 *  - 一个 Public Key（公开，客户端使用）
 */
import emailjs from '@emailjs/browser'
import { getConfig, setConfig } from '@/utils/db'

const CONFIG_KEY = '__email_settings__'

export interface EmailSettings {
  /** 是否启用邮件提醒 */
  enabled: boolean
  /** EmailJS Service ID（service_xxxx） */
  serviceId: string
  /** EmailJS Template ID（template_xxxx） */
  templateId: string
  /** 收件邮箱（对应模板的收件人变量，支持 QQ/Outlook/Gmail 等） */
  recipient: string
  /** EmailJS Public Key（公开，非敏感） */
  publicKey: string
  /** 模板中「收件人」变量名（默认 to_email） */
  paramTo: string
  /** 模板中「主题」变量名（默认 subject） */
  paramSubject: string
  /** 模板中「正文」变量名（默认 message） */
  paramMessage: string
}

const DEFAULT: EmailSettings = {
  enabled: false,
  serviceId: '',
  templateId: '',
  recipient: '',
  publicKey: '',
  paramTo: 'to_email',
  paramSubject: 'subject',
  paramMessage: 'message'
}

export async function getEmailSettings(): Promise<EmailSettings> {
  const saved = await getConfig<Partial<EmailSettings>>(CONFIG_KEY, {})
  return { ...DEFAULT, ...saved }
}

export async function saveEmailSettings(
  patch: Partial<EmailSettings>
): Promise<EmailSettings> {
  const next = { ...(await getEmailSettings()), ...patch }
  await setConfig(CONFIG_KEY, next)
  return next
}

/** 发送一封邮件（参数变量名与模板保持一致，否则 EmailJS 返回 422） */
export async function sendEmail(subject: string, text: string): Promise<void> {
  const settings = await getEmailSettings()
  if (!settings.enabled || !settings.serviceId || !settings.templateId || !settings.publicKey) {
    throw new Error('未配置邮件提醒（Service / Template / Public Key / 收件邮箱）')
  }
  if (!settings.recipient.trim()) throw new Error('未配置收件邮箱')
  const params: Record<string, string> = {}
  params[settings.paramTo || 'to_email'] = settings.recipient.trim()
  params[settings.paramSubject || 'subject'] = subject
  params[settings.paramMessage || 'message'] = text
  await emailjs.send(
    settings.serviceId.trim(),
    settings.templateId.trim(),
    params,
    { publicKey: settings.publicKey.trim() }
  )
}

/** 发送口令备份提醒 */
export async function sendPinReminder(pin: string): Promise<void> {
  const text = [
    '【云枢 CloudPivot】应用锁口令提醒',
    '',
    `您的应用锁口令为：${pin}`,
    '',
    '请妥善保管、切勿丢失。该口令用于解锁本机应用数据；',
    '若已开启「口令加固」，忘记口令将导致本机加密数据无法恢复。',
    '',
    '—— 云枢 CloudPivot'
  ].join('\n')
  await sendEmail('云枢 CloudPivot 应用锁口令提醒（请妥善保存）', text)
}

/** 发送口令重置验证码 */
export async function sendOtpEmail(otp: string): Promise<void> {
  const text = [
    '【云枢 CloudPivot】口令重置验证码',
    '',
    `您正在请求重置应用锁口令，本次验证码为：${otp}`,
    '验证码 10 分钟内有效，请勿泄露给他人。',
    '如非本人操作，请忽略本邮件。',
    '',
    '—— 云枢 CloudPivot'
  ].join('\n')
  await sendEmail('云枢 CloudPivot 口令重置验证码', text)
}

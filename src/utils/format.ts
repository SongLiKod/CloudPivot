/**
 * 通用格式化与轻量工具函数
 */

/** 时间格式化：YYYY-MM-DD HH:mm:ss */
export function formatTime(input?: number | string | Date | null, withSeconds = true): string {
  if (input === null || input === undefined || input === '') return '-'
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`
  return withSeconds ? `${base}:${pad(date.getSeconds())}` : base
}

/** 仅日期：YYYY-MM-DD */
export function formatDate(input?: number | string | Date | null): string {
  if (input === null || input === undefined || input === '') return '-'
  const date = input instanceof Date ? input : new Date(input)
  if (Number.isNaN(date.getTime())) return '-'
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 相对时间：3 分钟前 */
export function formatRelative(input?: number | string | Date | null): string {
  if (input === null || input === undefined || input === '') return '-'
  const date = input instanceof Date ? input : new Date(input)
  const diff = Date.now() - date.getTime()
  if (Number.isNaN(diff)) return '-'
  if (diff < 0) return formatTime(date, false)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 30 * day) return `${Math.floor(diff / day)} 天前`
  return formatDate(date)
}

/** 字节数格式化 */
export function formatBytes(bytes?: number | null, digits = 2): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes)) return '-'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']
  const index = Math.min(units.length - 1, Math.floor(Math.log(Math.abs(bytes)) / Math.log(1024)))
  const value = bytes / Math.pow(1024, index)
  return `${value.toFixed(index === 0 ? 0 : digits)} ${units[index]}`
}

/** 大数字紧凑格式：12.3K / 4.5M */
export function formatCompact(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  const abs = Math.abs(value)
  if (abs < 1000) return String(value)
  if (abs < 1_000_000) return `${(value / 1000).toFixed(1)}K`
  if (abs < 1_000_000_000) return `${(value / 1_000_000).toFixed(2)}M`
  return `${(value / 1_000_000_000).toFixed(2)}B`
}

/** 百分比 */
export function formatPercent(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '-'
  return `${(value * 100).toFixed(digits)}%`
}

/** TTL 展示：1 = Auto */
export function formatTtl(ttl?: number | null): string {
  if (!ttl) return '-'
  return ttl === 1 ? '自动' : `${ttl} 秒`
}

/** 延时 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 防抖 */
export function debounce<T extends (...args: never[]) => void>(fn: T, wait = 300) {
  let timer: ReturnType<typeof setTimeout> | null = null
  return function debounced(this: unknown, ...args: Parameters<T>) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => fn.apply(this, args), wait)
  }
}

/** 节流 */
export function throttle<T extends (...args: never[]) => void>(fn: T, wait = 500) {
  let last = 0
  return function throttled(this: unknown, ...args: Parameters<T>) {
    const now = Date.now()
    if (now - last >= wait) {
      last = now
      fn.apply(this, args)
    }
  }
}

/** 数组分块 */
export function chunk<T>(list: T[], size: number): T[][] {
  const result: T[][] = []
  for (let i = 0; i < list.length; i += size) result.push(list.slice(i, i + size))
  return result
}

/** 关键词高亮匹配（不区分大小写） */
export function matchKeyword(text: string | undefined | null, keyword: string): boolean {
  if (!keyword) return true
  if (!text) return false
  return text.toLowerCase().includes(keyword.trim().toLowerCase())
}

/** 安全解析 JSON */
export function safeJsonParse<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/** 复制文本到剪贴板（兼容非安全上下文降级） */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* 降级到 execCommand */
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(textarea)
    return ok
  } catch {
    return false
  }
}

/** 导出 Blob 为文件（Web / Android WebView 通用降级方案） */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

/** 版本号比较：a > b 返回 1 */
export function compareVersion(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

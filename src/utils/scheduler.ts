/**
 * 批量任务调度器
 *
 * 能力（技术文档 §3.2）：
 *  - 内存任务队列：入队、进度更新、暂停、恢复、终止
 *  - 并发数限制：防止触发 Cloudflare 429 限流
 *  - 指数退避重试：网络抖动 / 5xx / 429 自动重试
 *  - 单条子任务隔离：单个账号异常不影响整体批次
 */
import { sleep } from './format'

export type RunnerState = 'idle' | 'running' | 'paused' | 'aborted' | 'finished'

export interface RunnerHooks<T> {
  /** 单条子任务开始 */
  onStart?: (item: T, index: number) => void
  /** 单条子任务成功 */
  onSuccess?: (item: T, index: number, result: unknown) => void
  /** 单条子任务失败 */
  onError?: (item: T, index: number, error: Error) => void
  /** 进度变化（已完成数 / 总数） */
  onProgress?: (done: number, total: number, success: number, fail: number) => void
  /** 全部结束 */
  onFinished?: (state: RunnerState, stats: RunnerStats) => void
}

export interface RunnerStats {
  total: number
  done: number
  success: number
  fail: number
  state: RunnerState
}

export interface RunnerOptions {
  /** 最大并发数，默认 4 */
  concurrency?: number
  /** 每条子任务失败后的重试次数，默认 2 */
  retries?: number
  /** 重试基础退避（ms），默认 800，按 2^n 递增 */
  retryDelay?: number
  /** 每条子任务之间的最小间隔（ms），用于平滑限流，默认 0 */
  intervalMs?: number
  /** 收到 429 时的额外等待（ms），默认 5000 */
  rateLimitDelay?: number
}

/** 判断是否为可重试错误 */
export function isRetryableError(error: unknown): boolean {
  const err = error as { status?: number; code?: string; message?: string }
  const status = err?.status ?? 0
  if (status === 429 || status >= 500) return true
  const message = String(err?.message ?? '').toLowerCase()
  return (
    message.includes('timeout') ||
    message.includes('network') ||
    message.includes('econnaborted') ||
    message.includes('socket hang up')
  )
}

/** 判断是否为限流错误 */
export function isRateLimitError(error: unknown): boolean {
  return (error as { status?: number })?.status === 429
}

/**
 * 可控并发执行器
 *
 * 用法：
 * const runner = new TaskRunner(accounts, { concurrency: 4 })
 * runner.run(async (account) => { ... })
 */
export class TaskRunner<T> {
  private readonly items: T[]
  private readonly options: Required<RunnerOptions>
  private state: RunnerState = 'idle'
  private done = 0
  private success = 0
  private fail = 0
  private running = 0
  private cursor = 0
  private resolveGate: (() => void) | null = null
  private hooks: RunnerHooks<T> = {}

  constructor(items: T[], options: RunnerOptions = {}) {
    this.items = [...items]
    this.options = {
      concurrency: Math.max(1, options.concurrency ?? 4),
      retries: Math.max(0, options.retries ?? 2),
      retryDelay: options.retryDelay ?? 800,
      intervalMs: options.intervalMs ?? 0,
      rateLimitDelay: options.rateLimitDelay ?? 5000
    }
  }

  get stats(): RunnerStats {
    return {
      total: this.items.length,
      done: this.done,
      success: this.success,
      fail: this.fail,
      state: this.state
    }
  }

  get currentState(): RunnerState {
    return this.state
  }

  setHooks(hooks: RunnerHooks<T>) {
    this.hooks = hooks
    return this
  }

  /** 暂停：不再派发新任务，已在执行的任务会自然结束 */
  pause() {
    if (this.state !== 'running') return
    this.state = 'paused'
  }

  /** 恢复执行 */
  resume() {
    if (this.state !== 'paused') return
    this.state = 'running'
    const gate = this.resolveGate
    this.resolveGate = null
    gate?.()
  }

  /** 终止：跳过剩余全部任务 */
  abort() {
    if (this.state === 'finished' || this.state === 'aborted') return
    this.state = 'aborted'
    const gate = this.resolveGate
    this.resolveGate = null
    gate?.()
  }

  /** 启动队列 */
  async run(handler: (item: T, index: number) => Promise<unknown>): Promise<RunnerStats> {
    if (this.state === 'running') throw new Error('任务队列已在运行中')
    this.state = 'running'
    this.cursor = 0
    this.done = 0
    this.success = 0
    this.fail = 0

    const workers = Array.from({ length: Math.min(this.options.concurrency, this.items.length) }, () =>
      this.worker(handler)
    )
    await Promise.all(workers)

    if ((this.state as RunnerState) !== 'aborted') this.state = 'finished'
    this.hooks.onFinished?.(this.state, this.stats)
    return this.stats
  }

  private async worker(handler: (item: T, index: number) => Promise<unknown>) {
    for (;;) {
      if (this.state === 'aborted') return

      // 暂停闸门
      if (this.state === 'paused') {
        await new Promise<void>((resolve) => {
          this.resolveGate = resolve
        })
        if ((this.state as RunnerState) === 'aborted') return
      }

      const index = this.cursor++
      if (index >= this.items.length) return

      const item = this.items[index]
      this.running++
      this.hooks.onStart?.(item, index)

      try {
        const result = await this.executeWithRetry(handler, item, index)
        this.success++
        this.hooks.onSuccess?.(item, index, result)
      } catch (error) {
        this.fail++
        this.hooks.onError?.(item, index, error as Error)
      } finally {
        this.running--
        this.done++
        this.hooks.onProgress?.(this.done, this.items.length, this.success, this.fail)
      }

      if (this.options.intervalMs > 0) await sleep(this.options.intervalMs)
    }
  }

  private async executeWithRetry(
    handler: (item: T, index: number) => Promise<unknown>,
    item: T,
    index: number
  ): Promise<unknown> {
    let attempt = 0
    for (;;) {
      try {
        return await handler(item, index)
      } catch (error) {
        const canRetry = attempt < this.options.retries && isRetryableError(error)
        if (!canRetry) throw error
        const delay = isRateLimitError(error)
          ? this.options.rateLimitDelay
          : this.options.retryDelay * Math.pow(2, attempt)
        attempt++
        await sleep(delay)
      }
    }
  }

  /** 当前正在执行的子任务数量 */
  get activeCount(): number {
    return this.running
  }
}

/**
 * 简单并发限制：不关心暂停/终止时使用
 */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  handler: (item: T, index: number) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = []
  let cursor = 0

  async function worker() {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      try {
        const value = await handler(items[index], index)
        results[index] = { status: 'fulfilled', value }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker))
  return results
}

/**
 * 全局请求闸门：所有 Cloudflare 请求共享，避免瞬时高并发触发限流
 */
class GlobalGate {
  private limit = 6
  private active = 0
  private waiters: (() => void)[] = []

  setLimit(limit: number) {
    this.limit = Math.max(1, limit)
    this.drain()
  }

  get currentLimit() {
    return this.limit
  }

  get activeCount() {
    return this.active
  }

  private drain() {
    while (this.active < this.limit && this.waiters.length) {
      const next = this.waiters.shift()
      next?.()
    }
  }

  async acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++
      return
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve))
    this.active++
  }

  release() {
    this.active = Math.max(0, this.active - 1)
    this.drain()
  }

  async run<R>(task: () => Promise<R>): Promise<R> {
    await this.acquire()
    try {
      return await task()
    } finally {
      this.release()
    }
  }
}

export const globalGate = new GlobalGate()

/**
 * 批量任务队列面板（需求模块7）
 *
 * - 内存任务队列：入队、进度更新、暂停、恢复、终止
 * - 每条子任务执行结果写入 IndexedDB task_log_table
 * - 并发控制 + 429 限流保护
 * - 高危批量操作（删除/覆盖）二次确认标记
 */
import { defineStore } from 'pinia'
import type { BatchSubTaskResult, BatchTask, BatchTaskType } from '@/types'
import { listBatchTasks, saveBatchTask } from '@/utils/db'
import { randomId } from '@/utils/crypto'
import { TaskRunner, type RunnerState } from '@/utils/scheduler'
import { useLogStore } from './useLogStore'
import { useSettingsStore } from './useSettingsStore'

export interface CreateTaskInput {
  type: BatchTaskType
  title: string
  items: BatchSubTaskResult[]
  dangerous?: boolean
  payload?: Record<string, unknown>
}

export interface SubTaskEmit {
  (result: { success: boolean; message?: string }): void
}

export const useBatchStore = defineStore('batch', {
  state: () => ({
    tasks: [] as BatchTask[],
    loaded: false,
    /** 内存中的运行器（不持久化到 state，避免序列化问题） */
    runners: new Map<string, TaskRunner<BatchSubTaskResult>>() as unknown as Record<string, unknown>
  }),

  getters: {
    runningTasks(state) {
      return state.tasks.filter((t) => t.status === 'running' || t.status === 'paused')
    },
    totalRunning(state) {
      return state.tasks.filter((t) => t.status === 'running').length
    }
  },

  actions: {
    /** 内存运行器存取（Pinia 对象扫描友好） */
    _getRunner(id: string): TaskRunner<BatchSubTaskResult> | undefined {
      return (this.$state as unknown as { runners: Map<string, TaskRunner<BatchSubTaskResult>> }).runners.get(id)
    },
    _setRunner(id: string, runner: TaskRunner<BatchSubTaskResult>) {
      ;(this.$state as unknown as { runners: Map<string, TaskRunner<BatchSubTaskResult>> }).runners.set(id, runner)
    },

    async loadHistory() {
      if (this.loaded) return
      const history = await listBatchTasks(200)
      this.tasks = history
      this.loaded = true
    },

    /** 创建任务并入内存队列 */
    createTask(input: CreateTaskInput): BatchTask {
      const now = Date.now()
      const task: BatchTask = {
        id: randomId('task'),
        type: input.type,
        title: input.title,
        status: 'pending',
        total: input.items.length,
        successCount: 0,
        failCount: 0,
        doneCount: 0,
        createdAt: now,
        dangerous: input.dangerous ?? false,
        payload: input.payload ?? {},
        results: input.items
      }
      this.tasks = [task, ...this.tasks]
      void saveBatchTask(task).catch(() => undefined)
      return task
    },

    /**
     * 执行任务
     * @param taskId 任务 id
     * @param handler item 执行函数，通过 emit 上报子任务结果
     */
    async runTask(
      taskId: string,
      handler: (item: BatchSubTaskResult, emit: SubTaskEmit, index: number) => Promise<void>
    ) {
      const task = this.tasks.find((t) => t.id === taskId)
      if (!task) return
      if (task.status === 'running' || task.status === 'paused') return

      const settings = useSettingsStore()
      const logStore = useLogStore()
      const items = task.results

      // 重置计数（重跑场景）
      task.status = 'running'
      task.startedAt = Date.now()
      task.doneCount = 0
      task.successCount = 0
      task.failCount = 0
      await saveBatchTask(task)

      const runner = new TaskRunner<BatchSubTaskResult>(items, {
        concurrency: settings.config.concurrencyLimit,
        retries: settings.config.retryTimes
      })

      runner.setHooks({
        onStart: (item) => {
          task.results = task.results.map((r) =>
            r.accountId === item.accountId && r.target === item.target ? { ...r } : r
          )
        },
        onSuccess: (item, index, result) => {
          const summary = typeof result === 'string' ? result : '成功'
          task.results[index] = { ...item, success: true, message: summary, finishedAt: Date.now() }
          task.successCount++
          task.doneCount++
          this.persist(task)
        },
        onError: (item, index, error) => {
          task.results[index] = {
            ...item,
            success: false,
            message: (error as Error).message || '执行失败',
            finishedAt: Date.now()
          }
          task.failCount++
          task.doneCount++
          this.persist(task)
        },
        onProgress: () => this.persist(task),
        onFinished: (state) => this.finishTask(task, state)
      })

      this._setRunner(taskId, runner)
      runner
        .run(async (item, index) => {
          const messageHolder: { text?: string } = {}
          const emit: SubTaskEmit = ({ success, message }) => {
            messageHolder.text = message
            void success
          }
          await handler(item, emit, index)
          return messageHolder.text
        })
        .catch((error) => {
          void error
        })

      void logStore.write({
        module: 'batch',
        action: '批量任务启动',
        detail: `任务「${task.title}」开始执行，共 ${task.total} 项`,
        level: 'info'
      })
    },

    persist(task: BatchTask) {
      void saveBatchTask(task).catch(() => undefined)
    },

    /** 任务收尾（成功 / 失败 / 终止） */
    finishTask(task: BatchTask, state: RunnerState) {
      task.status = state === 'aborted' ? 'aborted' : state === 'paused' ? 'paused' : 'finished'
      task.finishedAt = Date.now()
      this.persist(task)
      const logStore = useLogStore()
      void logStore.write({
        module: 'batch',
        action: '批量任务结束',
        detail: `任务「${task.title}」结束：成功 ${task.successCount}，失败 ${task.failCount}`,
        level: task.failCount ? 'warning' : 'success',
        result: task.failCount ? 'fail' : 'success'
      })
    },

    /** 暂停任务 */
    pauseTask(taskId: string) {
      const runner = this._getRunner(taskId)
      const task = this.tasks.find((t) => t.id === taskId)
      if (!runner || !task) return
      runner.pause()
      task.status = 'paused'
      this.persist(task)
    },

    /** 恢复任务 */
    resumeTask(taskId: string) {
      const runner = this._getRunner(taskId)
      const task = this.tasks.find((t) => t.id === taskId)
      if (!runner || !task) return
      runner.resume()
      task.status = 'running'
      this.persist(task)
    },

    /** 终止任务 */
    abortTask(taskId: string) {
      const runner = this._getRunner(taskId)
      const task = this.tasks.find((t) => t.id === taskId)
      if (!runner || !task) return
      runner.abort()
      task.status = 'aborted'
      task.finishedAt = Date.now()
      this.persist(task)
    },

    /** 删除任务记录 */
    async removeTask(taskId: string) {
      const task = this.tasks.find((t) => t.id === taskId)
      if (task && (task.status === 'running' || task.status === 'paused')) {
        this.abortTask(taskId)
      }
      const db = await import('@/utils/db')
      await db.deleteRecord('task_log_table', taskId)
      this.tasks = this.tasks.filter((t) => t.id !== taskId)
    },

    /** 清空调度器引用（应用卸载时） */
    dispose() {
      for (const runner of (this.$state as unknown as { runners: Map<string, TaskRunner<BatchSubTaskResult>> }).runners.values()) {
        runner.abort()
      }
      ;(this.$state as unknown as { runners: Map<string, TaskRunner<BatchSubTaskResult>> }).runners.clear()
    }
  }
})
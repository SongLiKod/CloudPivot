<template>
  <div class="cp-page batch-page">
    <!-- 概览 -->
    <div class="batch-stats">
      <div class="batch-stat">
        <span class="batch-stat__num">{{ batchStore.tasks.length }}</span>
        <span class="batch-stat__label">任务</span>
      </div>
      <div class="batch-stat">
        <span class="batch-stat__num batch-stat__num--running">{{ batchStore.runningTasks.length }}</span>
        <span class="batch-stat__label">进行中</span>
      </div>
      <div class="batch-stat">
        <span class="batch-stat__num batch-stat__num--done">{{ finishedCount }}</span>
        <span class="batch-stat__label">已完成</span>
      </div>
      <div class="batch-stat">
        <span class="batch-stat__num batch-stat__num--fail">{{ failedCount }}</span>
        <span class="batch-stat__label">失败</span>
      </div>
    </div>

    <div class="cp-toolbar">
      <el-button type="primary" @click="openCreateDialog">
        <el-icon><Plus /></el-icon>新建批量任务
      </el-button>
      <div class="cp-flex-1"></div>
      <el-button :loading="batchStore.loaded" @click="reload">刷新</el-button>
    </div>

    <!-- 桌面表格 -->
    <template v-if="isDesktop">
      <el-table :data="batchStore.tasks" class="task-table">
        <el-table-column label="任务" min-width="240">
          <template #default="{ row }">
            <div class="task-title-row">
              <span class="cp-text-bold">{{ row.title }}</span>
              <el-tag size="small" effect="plain" class="type-tag">{{ typeLabel(row.type) }}</el-tag>
              <el-tag v-if="row.dangerous" size="small" type="danger" effect="dark">高危</el-tag>
            </div>
            <el-progress
              :percentage="progress(row as BatchTask)"
              :status="row.status === 'finished' && !row.failCount ? 'success' : row.status === 'failed' ? 'exception' : undefined"
              :stroke-width="6"
              style="max-width: 320px; margin-top: 4px"
            />
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="结果" width="160">
          <template #default="{ row }">
            <span class="ok-text">成功 {{ row.successCount }}</span>
            <span class="fail-text"> / 失败 {{ row.failCount }}</span>
            <div class="cp-text-sm cp-text-secondary">{{ row.doneCount }}/{{ row.total }}</div>
          </template>
        </el-table-column>
        <el-table-column label="创建时间" min-width="170">
          <template #default="{ row }">{{ formatTime(row.createdAt, false) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="300" fixed="right">
          <template #default="{ row }">
            <template v-if="row.status === 'pending' || row.status === 'finished' || row.status === 'aborted' || row.status === 'failed'">
              <el-button size="small" text type="primary" @click="startTask(row as BatchTask)">开始</el-button>
            </template>
            <template v-else-if="row.status === 'running'">
              <el-button size="small" text type="warning" @click="pauseTask(row as BatchTask)">暂停</el-button>
              <el-button size="small" text type="danger" @click="abortTask(row as BatchTask)">终止</el-button>
            </template>
            <template v-else-if="row.status === 'paused'">
              <el-button size="small" text type="primary" @click="resumeTask(row as BatchTask)">继续</el-button>
              <el-button size="small" text type="danger" @click="abortTask(row as BatchTask)">终止</el-button>
            </template>
            <el-button size="small" text @click="viewResults(row as BatchTask)">结果</el-button>
            <el-button size="small" text type="danger" @click="removeTask(row as BatchTask)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!batchStore.tasks.length" description="暂无任务，点击右上角「新建批量任务」开始" />
    </template>

    <!-- 移动端列表 -->
    <template v-else>
      <el-empty v-if="!batchStore.tasks.length" description="暂无任务" />
      <div v-for="row in batchStore.tasks" :key="row.id" class="cp-list-card">
        <div class="cp-list-card__head">
          <span class="cp-list-card__title">{{ row.title }}</span>
          <el-tag size="small" effect="light" :type="statusTagType(row.status)">{{ statusLabel(row.status) }}</el-tag>
        </div>
        <div class="cp-list-card__row"><span>类型</span><span>{{ typeLabel(row.type) }}<el-tag v-if="row.dangerous" size="small" type="danger" effect="dark" style="margin-left: 6px">高危</el-tag></span></div>
        <el-progress :percentage="progress(row)" :stroke-width="6" style="margin: 6px 0 2px" />
        <div class="cp-list-card__row"><span>结果</span><span><span class="ok-text">{{ row.successCount }}</span> 成功 / <span class="fail-text">{{ row.failCount }}</span> 失败 · {{ row.doneCount }}/{{ row.total }}</span></div>
        <div class="cp-list-card__actions">
          <van-button v-if="row.status === 'pending' || row.status === 'finished' || row.status === 'aborted' || row.status === 'failed'" size="mini" type="primary" plain @click="startTask(row)">开始</van-button>
          <van-button v-if="row.status === 'running'" size="mini" type="warning" plain @click="pauseTask(row)">暂停</van-button>
          <van-button v-if="row.status === 'paused'" size="mini" type="primary" plain @click="resumeTask(row)">继续</van-button>
          <van-button v-if="row.status === 'running' || row.status === 'paused'" size="mini" type="danger" plain @click="abortTask(row)">终止</van-button>
          <van-button size="mini" plain @click="viewResults(row)">结果</van-button>
          <van-button size="mini" type="danger" plain @click="removeTask(row)">删除</van-button>
        </div>
      </div>
    </template>

    <!-- 新建任务 -->
    <el-dialog
      :model-value="createVisible"
      title="新建批量任务"
      width="540px"
      :append-to-body="true"
      @close="createVisible = false"
    >
      <el-form label-width="90px" label-position="left">
        <el-form-item label="任务类型">
          <el-select v-model="createType" style="width: 100%">
            <el-option label="检测账号（凭据校验）" value="account-check" />
            <el-option label="刷新账号资源（域名/脚本/项目）" value="account-refresh" />
            <el-option label="删除 Worker 脚本" value="worker-delete" />
            <el-option label="重建 Pages 项目" value="pages-rebuild" />
          </el-select>
        </el-form-item>
        <el-form-item label="目标账号">
          <el-select v-model="createAccounts" multiple filterable placeholder="选择一个或多个账号" style="width: 100%">
            <el-option v-for="acc in accountStore.accounts" :key="acc.id" :label="acc.name" :value="acc.id" />
          </el-select>
        </el-form-item>

        <el-form-item v-if="createType === 'worker-delete' || createType === 'pages-rebuild'" :label="createType === 'worker-delete' ? '删除脚本' : '重建项目'">
          <div class="target-checker">
            <el-checkbox-group v-model="createTargets">
              <el-checkbox
                v-for="t in targetOptions"
                :key="`${t.__accountId}/${t.target}`"
                :value="`${t.__accountId}/${t.target}`"
                :disabled="t.dangerous"
              >
                <span v-if="createType === 'worker-delete'" class="cp-mono">{{ t.target }}</span>
                <span v-else>{{ t.target }}</span>
                <span class="cp-text-secondary cp-text-sm">（{{ accountName(t.__accountId) }}）</span>
              </el-checkbox>
            </el-checkbox-group>
            <div v-if="!targetOptions.length" class="cp-text-sm cp-text-secondary" style="padding: 6px 0">
              {{ createType === 'worker-delete' ? '所选账号暂无 Worker 脚本' : '所选账号暂无 Pages 项目' }}，可先刷新资源
            </div>
          </div>
        </el-form-item>

        <el-alert v-if="createType === 'worker-delete'" type="error" :closable="false" show-icon title="高危操作" description="删除后脚本及其部署将无法恢复，请谨慎选择。" />
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" :disabled="!canCreate" @click="createAndRun">
          创建并执行
        </el-button>
      </template>
    </el-dialog>

    <!-- 任务结果 -->
    <el-dialog
      :model-value="resultVisible"
      :title="`任务结果 · ${resultTask?.title ?? ''}`"
      width="640px"
      :append-to-body="true"
      @close="resultVisible = false"
    >
      <el-table :data="resultTask?.results ?? []" max-height="420">
        <el-table-column label="账号" min-width="150">
          <template #default="{ row }">{{ row.accountName }}</template>
        </el-table-column>
        <el-table-column label="目标" min-width="180">
          <template #default="{ row }"><span class="cp-mono">{{ row.target }}</span></template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="row.success ? 'success' : 'danger'">{{ row.success ? '成功' : '失败' }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="信息" min-width="200" show-overflow-tooltip>
          <template #default="{ row }">{{ row.message ?? '-' }}</template>
        </el-table-column>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { usePlatform } from '@/utils/platform'
import { useAccountStore } from '@/store/useAccountStore'
import { useBatchStore, type SubTaskEmit } from '@/store/useBatchStore'
import { useResourceStore } from '@/store/useResourceStore'
import { useLogStore } from '@/store/useLogStore'
import { buildRequestContext } from '@/store/credentialService'
import * as workersApi from '@/api/workers'
import * as pagesApi from '@/api/pages'
import { formatTime } from '@/utils/format'
import type { BatchSubTaskResult, BatchTask, BatchTaskType } from '@/types'

const { isDesktop, isMobile } = usePlatform()
const accountStore = useAccountStore()
const batchStore = useBatchStore()
const resourceStore = useResourceStore()
const logStore = useLogStore()

/* ---------------- 概览 ---------------- */
const finishedCount = computed(
  () => batchStore.tasks.filter((t) => t.status === 'finished').length
)
const failedCount = computed(
  () => batchStore.tasks.reduce((sum, t) => sum + t.failCount, 0)
)

/* ---------------- 列表 ---------------- */
const TYPE_LABELS: Record<BatchTaskType, string> = {
  'dns-create': '新增 DNS 记录',
  'dns-update': '修改 DNS 记录',
  'dns-delete': '删除 DNS 记录',
  'worker-deploy': '部署 Worker',
  'worker-delete': '删除 Worker 脚本',
  'worker-vars': '更新 Worker 变量',
  'worker-route': '更新 Worker 路由',
  'pages-rebuild': '重建 Pages 项目',
  'pages-env': '更新 Pages 环境变量',
  'pages-auto-deploy': 'Pages 自动部署',
  'waf-sync': 'WAF 规则同步',
  'account-check': '检测账号',
  'account-refresh': '刷新账号资源',
  'account-delete': '注销账号',
  'template-sync': '模板同步'
}

function typeLabel(type: BatchTaskType): string {
  return TYPE_LABELS[type] ?? type
}

const STATUS_LABELS: Record<string, string> = {
  pending: '等待',
  running: '运行中',
  paused: '已暂停',
  finished: '已完成',
  aborted: '已终止',
  failed: '已失败'
}

function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status
}

function statusTagType(status: string): 'info' | 'primary' | 'warning' | 'success' | 'danger' {
  switch (status) {
    case 'running':
      return 'primary'
    case 'paused':
      return 'warning'
    case 'finished':
      return 'success'
    case 'aborted':
    case 'failed':
      return 'danger'
    default:
      return 'info'
  }
}

function progress(task: BatchTask): number {
  if (!task.total) return 0
  return Math.round((task.doneCount / task.total) * 100)
}

function reload() {
  return batchStore.loadHistory()
}

/* ---------------- 任务操作 ---------------- */
async function startTask(task: BatchTask) {
  if (task.status === 'pending' || task.status === 'finished' || task.status === 'aborted' || task.status === 'failed') {
    if (task.dangerous && task.total > 0) {
      await ElMessageBox.confirm(
        `「${task.title}」为高危批量操作（共 ${task.total} 项），确认执行？`,
        '高危确认',
        { type: 'warning', confirmButtonText: '确认执行', cancelButtonText: '取消' }
      )
    }
  }
  batchStore.runTask(task.id, (item, emit) => executeItem(task.id, item, emit))
  ElMessage.success('任务已开始')
}

function pauseTask(task: BatchTask) {
  batchStore.pauseTask(task.id)
}

function resumeTask(task: BatchTask) {
  batchStore.resumeTask(task.id)
}

function abortTask(task: BatchTask) {
  void ElMessageBox.confirm(`确认终止任务「${task.title}」？未完成的项目将标记失败。`, '终止任务', {
    type: 'warning',
    confirmButtonText: '终止',
    cancelButtonText: '取消'
  }).then(() => batchStore.abortTask(task.id))
}

async function removeTask(task: BatchTask) {
  await ElMessageBox.confirm(`删除任务记录「${task.title}」？`, '删除任务', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  await batchStore.removeTask(task.id)
}

/* ---------------- 子任务执行 ---------------- */
async function executeItem(
  taskId: string,
  item: BatchSubTaskResult,
  emit: SubTaskEmit
) {
  const task = batchStore.tasks.find((t) => t.id === taskId)
  if (!task) throw new Error('任务不存在')
  const account = accountStore.accounts.find((a) => a.id === item.accountId)
  if (!account) throw new Error(`未找到账号：${item.accountName}`)

  switch (task.type) {
    case 'account-check': {
      const result = await accountStore.recheckAccount(item.accountId)
      emit({ success: result?.ok ?? false, message: result?.statusMessage ?? '状态未知' })
      return
    }
    case 'account-refresh': {
      const result = await accountStore.refreshAccount(item.accountId)
      if (result === null) {
        emit({ success: false, message: '资源刷新失败（网络异常或账号不可用）' })
        return
      }
      emit({ success: true, message: '资源已刷新' })
      return
    }
    case 'worker-delete': {
      const ctx = await buildRequestContext(account)
      await workersApi.deleteWorkerScript(ctx, account.cfAccountId ?? '', item.target)
      emit({ success: true, message: `已删除脚本 ${item.target}` })
      return
    }
    case 'pages-rebuild': {
      const ctx = await buildRequestContext(account)
      await pagesApi.triggerPagesDeployment(ctx, account.cfAccountId ?? '', item.target)
      emit({ success: true, message: `已触发 ${item.target} 构建` })
      return
    }
    default:
      throw new Error(`尚未支持的任务类型：${TYPE_LABELS[task.type]}`)
  }
}

/* ---------------- 新建任务 ---------------- */
const createVisible = ref(false)
const creating = ref(false)
const createType = ref<BatchTaskType>('account-check')
const createAccounts = ref<string[]>([])

interface TargetOption {
  __accountId: string | undefined
  accountName: string
  target: string
  /** 是否高危（worker 删除） */
  dangerous?: boolean
}

function accountName(accountId?: string): string {
  if (!accountId) return '-'
  return accountStore.accounts.find((a) => a.id === accountId)?.name ?? '未知账号'
}

/** Worker 脚本池（按所选账号过滤） */
const workerPool = computed<TargetOption[]>(() => {
  const selSet = new Set(createAccounts.value)
  return resourceStore.workers.rows
    .filter((r): r is typeof r & { __accountId: string } => !!r.__accountId && selSet.has(r.__accountId))
    .map((r) => ({
      __accountId: r.__accountId,
      accountName: accountName(r.__accountId),
      target: r.id
    }))
})

/** Pages 项目池（按所选账号过滤） */
const pagesPool = computed<TargetOption[]>(() => {
  const selSet = new Set(createAccounts.value)
  return resourceStore.pages.rows
    .filter((r): r is typeof r & { __accountId: string } => !!r.__accountId && selSet.has(r.__accountId))
    .map((r) => ({
      __accountId: r.__accountId,
      accountName: accountName(r.__accountId),
      target: r.name
    }))
})

const targetOptions = computed<TargetOption[]>(() => {
  switch (createType.value) {
    case 'worker-delete':
      return workerPool.value
    case 'pages-rebuild':
      return pagesPool.value
    default:
      return []
  }
})

const createTargets = ref<string[]>([])

const canCreate = computed(() => {
  if (!createAccounts.value.length) return false
  if (createType.value === 'worker-delete' || createType.value === 'pages-rebuild') {
    return createTargets.value.length > 0
  }
  return true
})

async function openCreateDialog() {
  createType.value = 'account-check'
  createAccounts.value = []
  createTargets.value = []
  // 提前加载资源列表，便于选择 worker / pages 目标
  if (!resourceStore.workers.loaded) {
    void resourceStore.loadWorkers()
  }
  if (!resourceStore.pages.loaded) {
    void resourceStore.loadPages()
  }
  createVisible.value = true
}

async function createAndRun() {
  const taskType = createType.value
  let items: BatchSubTaskResult[] = []

  const accountItems = () =>
    createAccounts.value.map((id) => {
      const acc = accountStore.accounts.find((a) => a.id === id)!
      return { accountId: id, accountName: acc.name, target: acc.name, success: false, finishedAt: 0 }
    })

  switch (taskType) {
    case 'account-check':
    case 'account-refresh':
      items = accountItems()
      break
    case 'worker-delete':
    case 'pages-rebuild': {
      const selTargets = new Set(createTargets.value)
      const pool =
        taskType === 'worker-delete'
          ? workerPool.value
          : pagesPool.value
      items = pool
        .filter((t) => selTargets.has(`${t.__accountId}/${t.target}`))
        .map((t) => ({
          accountId: t.__accountId ?? '',
          accountName: t.accountName,
          target: t.target,
          success: false,
          finishedAt: 0
        }))
      break
    }
    default:
      ElMessage.warning('暂不支持该任务类型')
      return
  }

  if (!items.length) {
    ElMessage.warning('没有可执行的项目')
    return
  }
  if (taskType === 'worker-delete') {
    await ElMessageBox.confirm(
      `确认对 ${items.length} 个 Worker 脚本执行删除？此操作不可恢复。`,
      '高危操作确认',
      { type: 'error', confirmButtonText: '确认删除', cancelButtonText: '取消' }
    )
  }

  creating.value = true
  try {
    const task = batchStore.createTask({
      type: taskType,
      title: `${TYPE_LABELS[taskType]}（${items.length} 项）`,
      items,
      dangerous: taskType === 'worker-delete',
      payload: { accounts: createAccounts.value }
    })
    batchStore.runTask(task.id, (item, emit) => executeItem(task.id, item, emit))
    const accountNames = createAccounts.value
      .map((id) => accountStore.accounts.find((a) => a.id === id)?.name ?? '')
      .join('、')
    await logStore.write({
      module: 'batch',
      action: '创建批量任务',
      detail: `创建「${TYPE_LABELS[taskType]}」任务，目标账号：${accountNames}，共 ${items.length} 项`,
      level: taskType === 'worker-delete' ? 'warning' : 'info'
    })
    createVisible.value = false
    ElMessage.success(`任务已创建并开始执行（共 ${items.length} 项）`)
  } finally {
    creating.value = false
  }
}

/* ---------------- 结果查看 ---------------- */
const resultVisible = ref(false)
const resultTask = ref<BatchTask | null>(null)

function viewResults(task: BatchTask) {
  resultTask.value = task
  resultVisible.value = true
}

onMounted(async () => {
  await accountStore.load()
  await batchStore.loadHistory()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.batch-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 14px;

  @include mobile {
    gap: 8px;
  }
}

.batch-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 14px 10px;
  border-radius: $radius-md;
  background: var(--cp-card-bg);
  border: 1px solid var(--cp-border-light);

  &__num {
    font-size: 22px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;

    &--running {
      color: var(--cp-primary);
    }

    &--done {
      color: var(--cp-success, #07c160);
    }

    &--fail {
      color: var(--cp-danger, #f56c6c);
    }
  }

  &__label {
    font-size: 12px;
    color: var(--cp-text-secondary);
  }
}

.task-table {
  @include card;
}

.task-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.type-tag {
  margin-right: 2px;
}

.ok-text {
  color: var(--cp-success, #07c160);
}

.fail-text {
  color: var(--cp-danger, #f56c6c);
}

.target-checker {
  width: 100%;
  max-height: 220px;
  overflow: auto;
  padding: 10px;
  border-radius: $radius-sm;
  border: 1px solid var(--cp-border-light);
  background: var(--cp-bg-sunken);

  :deep(.el-checkbox) {
    display: flex;
    margin-right: 0;
    height: auto;
    margin-bottom: 6px;
  }
}
</style>
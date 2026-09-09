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
        <el-table-column v-if="settingsStore.config.showRowIndex" type="index" width="52" align="center" label="#" />
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
      <div v-for="(row, index) in batchStore.tasks" :key="row.id" class="cp-list-card">
        <div class="cp-list-card__head">
          <span v-if="settingsStore.config.showRowIndex" class="list-index">{{ index + 1 }}</span>
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
      width="620px"
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
            <el-option label="更新 Worker 环境变量" value="worker-vars" />
            <el-option label="批量部署 Worker 代码" value="worker-deploy" />
            <el-option label="更新 Pages 环境变量" value="pages-env" />
            <el-option label="同步 WAF IP 规则" value="waf-sync" />
            <el-option label="套用 DNS 模板" value="template-sync" />
            <el-option label="切换 DNS 代理开关" value="dns-update" />
            <el-option label="删除 DNS 记录" value="dns-delete" />
          </el-select>
          <div v-if="typeDescription" class="type-desc">{{ typeDescription }}</div>
        </el-form-item>

        <el-form-item label="所属账号">
          <el-select
            v-model="createAccounts"
            :multiple="createType !== 'waf-sync'"
            filterable
            placeholder="选择一个或多个账号"
            style="width: 100%"
          >
            <el-option v-for="acc in accountStore.accounts" :key="acc.id" :label="acc.name" :value="acc.id" />
          </el-select>
        </el-form-item>

        <!-- 目标资源筛选 -->
        <el-form-item v-if="TARGET_SELECTOR_TYPES.has(createType)" :label="targetLabel">
          <div class="target-checker">
            <el-checkbox-group v-model="createTargets">
              <el-checkbox
                v-for="t in targetOptions"
                :key="`${t.__accountId}/${t.target}`"
                :value="`${t.__accountId}/${t.target}`"
                :disabled="t.dangerous"
              >
                <span :class="{ 'cp-mono': createType.startsWith('worker') }">{{ t.label ?? t.target }}</span>
                <span class="cp-text-secondary cp-text-sm">（{{ accountName(t.__accountId) }}）</span>
              </el-checkbox>
            </el-checkbox-group>
            <div v-if="!targetOptions.length" class="cp-text-sm cp-text-secondary" style="padding: 6px 0">
              {{ targetEmptyText }}，可先刷新资源
            </div>
          </div>
        </el-form-item>

        <!-- WAF 同步：来源域名 -->
        <el-form-item v-if="createType === 'waf-sync'" label="来源域名">
          <el-select v-model="sourceZoneId" style="width: 100%" placeholder="选择要复制 IP 规则的域名">
            <el-option v-for="z in zonePool" :key="z.target" :label="z.label" :value="z.target" />
          </el-select>
        </el-form-item>

        <!-- Worker 环境变量 -->
        <template v-if="createType === 'worker-vars'">
          <el-form-item label="变量名">
            <el-input v-model="taskVarName" placeholder="如 API_TOKEN" class="cp-mono" />
          </el-form-item>
          <el-form-item label="变量值">
            <el-input v-model="taskVarValue" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="变量类型">
            <el-select v-model="taskVarType" style="width: 100%">
              <el-option label="普通文本" value="plain_text" />
              <el-option label="密钥（加密）" value="secret_text" />
              <el-option label="JSON" value="json" />
            </el-select>
          </el-form-item>
        </template>

        <!-- Worker 部署 -->
        <template v-if="createType === 'worker-deploy'">
          <el-form-item label="部署代码">
            <el-input
              v-model="taskDeployCode"
              type="textarea"
              :rows="8"
              class="cp-mono"
              placeholder="ES Module Worker 代码，将部署到所选脚本"
            />
          </el-form-item>
          <el-form-item label="兼容日期">
            <el-input v-model="taskCompatDate" placeholder="2024-01-01" class="cp-mono" />
          </el-form-item>
        </template>

        <!-- Pages 环境变量 -->
        <template v-if="createType === 'pages-env'">
          <el-form-item label="变量名">
            <el-input v-model="taskEnvKey" placeholder="如 REACT_APP_API" class="cp-mono" />
          </el-form-item>
          <el-form-item label="变量值">
            <el-input v-model="taskEnvValue" type="textarea" :rows="2" />
          </el-form-item>
          <el-form-item label="环境">
            <el-radio-group v-model="taskEnvEnvironment">
              <el-radio value="production">生产</el-radio>
              <el-radio value="preview">预发 Preview</el-radio>
            </el-radio-group>
          </el-form-item>
        </template>

        <!-- DNS 模板 -->
        <el-form-item v-if="createType === 'template-sync'" label="DNS 模板">
          <el-select v-model="taskTemplateId" style="width: 100%" placeholder="选择已保存的 DNS 模板">
            <el-option v-for="tpl in templates" :key="tpl.id" :label="`${tpl.name}（${tpl.records.length} 条）`" :value="tpl.id" />
          </el-select>
        </el-form-item>

        <!-- DNS 代理 -->
        <el-form-item v-if="createType === 'dns-update'" label="代理目标">
          <el-radio-group v-model="taskProxyMode">
            <el-radio value="on">开启 CDN 代理（橙色云朵）</el-radio>
            <el-radio value="off">关闭（仅 DNS）</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- DNS 记录删除 -->
        <template v-if="createType === 'dns-delete'">
          <el-form-item label="记录类型">
            <el-select v-model="filterRecordType" clearable placeholder="全部类型" style="width: 100%">
              <el-option v-for="t in BATCH_RECORD_TYPES" :key="t" :label="t" :value="t" />
            </el-select>
          </el-form-item>
          <el-form-item label="主机名包含">
            <el-input v-model="filterRecordName" placeholder="如 www / api，留空表示匹配该类型全部记录" class="cp-mono" />
          </el-form-item>
        </template>

        <el-alert v-if="createType === 'worker-delete'" type="error" :closable="false" show-icon title="高危操作" description="删除后脚本及其部署将无法恢复，请谨慎选择。" />
        <el-alert v-if="createType === 'dns-delete'" type="error" :closable="false" show-icon title="高危操作" description="将按筛选条件批量删除目标域名的解析记录，删除后无法恢复，请谨慎选择。" />
        <el-alert v-if="createType === 'template-sync'" type="info" :closable="false" show-icon title="覆盖提示" description="套用模板仅新增记录，不会删除目标域名已有的记录。" />
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
defineOptions({ name: 'BatchView' })
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'
import { usePlatform } from '@/utils/platform'
import { useAccountStore } from '@/store/useAccountStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useBatchStore, type SubTaskEmit } from '@/store/useBatchStore'
import { useResourceStore } from '@/store/useResourceStore'
import { useLogStore } from '@/store/useLogStore'
import { buildRequestContext } from '@/store/credentialService'
import * as workersApi from '@/api/workers'
import * as pagesApi from '@/api/pages'
import * as dnsApi from '@/api/dns'
import * as wafApi from '@/api/waf'
import { formatTime } from '@/utils/format'
import { getAllRecords, STORE } from '@/utils/db'
import type { BatchSubTaskResult, BatchTask, BatchTaskType, CfWorkerVariable, DnsTemplate } from '@/types'

const { isDesktop, isMobile } = usePlatform()
const accountStore = useAccountStore()
const settingsStore = useSettingsStore()
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

/** 各任务类型用途说明（在新建任务弹窗展示） */
const TYPE_DESCRIPTIONS: Partial<Record<BatchTaskType, string>> = {
  'account-check': '逐个账号执行凭据校验，识别「正常 / 失效 / 权限不足 / 过期」等状态，结果写入任务明细。',
  'account-refresh': '逐个账号重新拉取托管域名（Zone）、Worker 脚本与 Pages 项目列表，并更新资源统计与本地缓存。',
  'worker-delete': '批量删除所选账号下勾选的 Worker 脚本。删除后脚本及其所有部署不可恢复，属高危操作。',
  'pages-rebuild': '批量对所选 Pages 项目触发一次重新构建（按生产分支重新生成站点），常用于手动重建部署。',
  'worker-vars': '给多个 Worker 脚本统一新增 / 覆盖同一个环境变量（支持明文、密钥、JSON）。',
  'worker-deploy': '把同一份代码批量部署到多个 Worker 脚本，便于统一版本 / 灰度铺开。',
  'pages-env': '给多个 Pages 项目统一写入同一个环境变量（生产 / 预发 Preview 环境）。',
  'waf-sync': '把一个来源域名的 IP 访问规则（黑/白名单）批量同步到所选目标域名。',
  'template-sync': '把已保存的 DNS 模板批量套用到多个域名（仅新增记录，不删除既有记录）。',
  'dns-update': '批量开启 / 关闭目标域名解析记录的 CDN 代理（橙色云朵），常用于回源切换。',
  'dns-delete': '按记录类型 / 主机名关键字筛选，批量删除目标域名下的解析记录，删除后不可恢复（高危）。'
}

const typeDescription = computed(() => TYPE_DESCRIPTIONS[createType.value] ?? '')

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
    case 'worker-vars': {
      const payload = task.payload as { name: string; value: string; type: string }
      const ctx = await buildRequestContext(account)
      const cfAccountId = account.cfAccountId
      if (!cfAccountId) {
        emit({ success: false, message: '账号缺少 Cloudflare 账号 ID' })
        return
      }
      const bindings = await workersApi.listWorkerBindings(ctx, cfAccountId, item.target)
      const name = payload.name
      const isSecret = payload.type === 'secret_text'
      if (isSecret) {
        await workersApi.putWorkerSecret(ctx, cfAccountId, item.target, name, payload.value)
      }
      const next = bindings.filter((b) => (b.binding ?? b.name) !== name)
      if (isSecret) next.push({ name, type: 'secret_text' })
      else if (payload.type === 'json') next.push({ name, type: 'json', text: payload.value })
      else next.push({ name, type: 'plain_text', text: payload.value })
      const finalPayload: { type: 'plain_text' | 'secret_text' | 'json'; name: string; text?: string; json?: string }[] =
        next.map((b: CfWorkerVariable) => {
          const t = (b.type ?? 'plain_text') as 'plain_text' | 'secret_text' | 'json'
          const bn = b.binding ?? b.name ?? ''
          if (t === 'secret_text') return { type: t, name: bn }
          if (t === 'json') return { type: t, name: bn, json: b.text ?? '' }
          return { type: t, name: bn, text: b.text ?? '' }
        })
      await workersApi.updateWorkerBindings(ctx, cfAccountId, item.target, finalPayload)
      emit({ success: true, message: `已设置变量 ${name}` })
      return
    }
    case 'worker-deploy': {
      const payload = task.payload as { code: string; compatDate?: string }
      const ctx = await buildRequestContext(account)
      await workersApi.deployWorkerScript(ctx, account.cfAccountId ?? '', item.target, payload.code, {
        main_module: 'module',
        compatibility_date: payload.compatDate || '2024-01-01'
      })
      emit({ success: true, message: `已部署 ${item.target}` })
      return
    }
    case 'pages-env': {
      const payload = task.payload as { key: string; value: string; environment: 'production' | 'preview' }
      const ctx = await buildRequestContext(account)
      const cfAccountId = account.cfAccountId
      if (!cfAccountId) {
        emit({ success: false, message: '账号缺少 Cloudflare 账号 ID' })
        return
      }
      const project = await pagesApi.getPagesProject(ctx, cfAccountId, item.target)
      const current = (project.deployment_configs ?? {}) as Record<
        string,
        { env_variables?: Record<string, { value: string; type?: string }> }
      >
      const envConfig = { ...(current[payload.environment] ?? {}) }
      const envVars: Record<string, { value: string; type?: string }> = {
        ...(envConfig.env_variables ?? {}),
        [payload.key]: { value: payload.value }
      }
      const nextConfigs: Record<string, { env_variables?: Record<string, { value: string; type?: string }> }> = {
        ...current,
        [payload.environment]: { ...envConfig, env_variables: envVars }
      }
      await pagesApi.updatePagesProject(ctx, cfAccountId, item.target, { deployment_configs: nextConfigs })
      emit({ success: true, message: `已设置变量 ${payload.key}` })
      return
    }
    case 'waf-sync': {
      const payload = task.payload as { sourceZoneId: string; count?: number }
      if (item.target === payload.sourceZoneId) {
        emit({ success: true, message: '来源与目标相同，跳过' })
        return
      }
      const ctx = await buildRequestContext(account)
      const rules = await wafApi.listAccessRules(ctx, payload.sourceZoneId)
      const payloads: wafApi.AccessRulePayload[] = rules
        .filter((r): r is typeof r & { configuration: { target: 'ip' | 'ip_range' | 'asn' | 'country'; value: string }; mode: string } => !!r.configuration?.value)
        .map((r) => ({
          mode: (r.mode ?? 'block') as wafApi.AccessRulePayload['mode'],
          configuration: { target: r.configuration.target, value: r.configuration.value },
          notes: r.notes ?? `WAF 同步自 ${payload.sourceZoneId.slice(0, 8)}`
        }))
      const result = await wafApi.createAccessRulesBulk(ctx, item.target, payloads)
      emit({
        success: true,
        message: `已同步 ${result.ok} 条规则${result.fails.length ? `，失败 ${result.fails.length} 条` : ''}`
      })
      return
    }
    case 'template-sync': {
      const payload = task.payload as { template: DnsTemplate }
      const ctx = await buildRequestContext(account)
      let ok = 0
      const errors: string[] = []
      for (const rec of payload.template.records) {
        try {
          await dnsApi.createDnsRecord(ctx, item.target, {
            type: rec.type,
            name: rec.name,
            content: rec.content,
            ttl: rec.ttl,
            proxied: rec.proxied,
            priority: rec.priority
          })
          ok++
        } catch (error) {
          errors.push((error as Error).message)
        }
      }
      emit({
        success: true,
        message: `${payload.template.name}：新增 ${ok} 条${errors.length ? `，失败 ${errors.length}` : ''}`
      })
      return
    }
    case 'dns-update': {
      const payload = task.payload as { proxied: boolean }
      const ctx = await buildRequestContext(account)
      const records = await dnsApi.listDnsRecords(ctx, item.target)
      let changed = 0
      const errors: string[] = []
      for (const r of records) {
        if (!r.proxiable || !!r.proxied === payload.proxied) continue
        try {
          await dnsApi.updateDnsRecord(ctx, item.target, r.id, { proxied: payload.proxied })
          changed++
        } catch (error) {
          errors.push((error as Error).message)
        }
      }
      emit({
        success: true,
        message: `已 ${payload.proxied ? '开启' : '关闭'}代理 ${changed} 条${errors.length ? `，失败 ${errors.length}` : ''}`
      })
      return
    }
    case 'dns-delete': {
      const payload = task.payload as { type?: string; name?: string }
      const ctx = await buildRequestContext(account)
      const records = await dnsApi.listDnsRecords(ctx, item.target)
      let deleted = 0
      const errors: string[] = []
      for (const r of records) {
        if (payload.type && r.type !== payload.type) continue
        if (payload.name && !(r.name ?? '').toLowerCase().includes(payload.name.toLowerCase())) continue
        try {
          await dnsApi.deleteDnsRecord(ctx, r.zone_id ?? item.target, r.id)
          deleted++
        } catch (error) {
          errors.push((error as Error).message)
        }
      }
      emit({
        success: deleted > 0,
        message: deleted > 0 || errors.length ? `已删除 ${deleted} 条${errors.length ? `，失败 ${errors.length}` : ''}` : '未匹配到可删除的记录'
      })
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

/** 需要勾选目标资源的任务类型 */
const TARGET_SELECTOR_TYPES = new Set<BatchTaskType>([
  'worker-delete',
  'worker-vars',
  'worker-deploy',
  'pages-rebuild',
  'pages-env',
  'waf-sync',
  'template-sync',
  'dns-update',
  'dns-delete'
])

const BATCH_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'] as const

interface TargetOption {
  __accountId: string | undefined
  accountName: string
  target: string
  /** 展示名（默认同 target） */
  label?: string
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
      target: r.id,
      label: r.id
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
      target: r.name,
      label: r.name
    }))
})

/** 托管域名池（按所选账号过滤，用于 WAF 同步 / DNS 模板 / 代理开关） */
const zonePool = computed<TargetOption[]>(() => {
  const selSet = new Set(createAccounts.value)
  return resourceStore.zones.rows
    .filter(
      (z): z is typeof z & { __accountId: string } =>
        !!z.__accountId && selSet.has(z.__accountId) && z.status === 'active'
    )
    .map((z) => ({
      __accountId: z.__accountId,
      accountName: accountName(z.__accountId),
      target: z.id,
      label: z.name
    }))
})

const targetOptions = computed<TargetOption[]>(() => {
  switch (createType.value) {
    case 'worker-delete':
    case 'worker-vars':
    case 'worker-deploy':
      return workerPool.value
    case 'pages-rebuild':
    case 'pages-env':
      return pagesPool.value
    case 'waf-sync':
    case 'template-sync':
    case 'dns-update':
    case 'dns-delete':
      return zonePool.value
    default:
      return []
  }
})

const targetLabel = computed(() => {
  switch (createType.value) {
    case 'worker-delete':
      return '删除脚本'
    case 'worker-vars':
    case 'worker-deploy':
      return '目标脚本'
    case 'pages-rebuild':
    case 'pages-env':
      return '目标项目'
    case 'waf-sync':
    case 'template-sync':
    case 'dns-update':
    case 'dns-delete':
      return '目标域名'
    default:
      return '目标'
  }
})

const targetEmptyText = computed(() => {
  if (createType.value.startsWith('worker')) return '所选账号暂无 Worker 脚本'
  if (createType.value.startsWith('pages')) return '所选账号暂无 Pages 项目'
  return '所选账号暂无域名'
})

const createTargets = ref<string[]>([])

/* 各任务附加配置 */
const sourceZoneId = ref('')
const taskVarName = ref('')
const taskVarValue = ref('')
const taskVarType = ref('plain_text')
const taskDeployCode = ref('')
const taskCompatDate = ref('')
const taskEnvKey = ref('')
const taskEnvValue = ref('')
const taskEnvEnvironment = ref<'production' | 'preview'>('production')
const taskTemplateId = ref('')
const taskProxyMode = ref<'on' | 'off'>('on')

/** DNS 记录删除筛选 */
const filterRecordType = ref('')
const filterRecordName = ref('')

/** 已保存的 DNS 模板 */
const templates = ref<DnsTemplate[]>([])

async function loadTemplates() {
  templates.value = await getAllRecords<DnsTemplate>(STORE.template)
}

const DEFAULT_WORKER_CODE = `export default {
  async fetch(request, env, ctx) {
    return new Response('Hello from the edge!', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    })
  }
}
`

const canCreate = computed(() => {
  if (!createAccounts.value.length) return false
  if (createType.value === 'waf-sync') {
    return !!sourceZoneId.value && createTargets.value.length > 0
  }
  if (createType.value === 'template-sync') {
    return !!taskTemplateId.value && createTargets.value.length > 0
  }
  if (createType.value === 'dns-update') {
    return createTargets.value.length > 0
  }
  if (createType.value === 'dns-delete') {
    return createTargets.value.length > 0
  }
  if (createType.value === 'worker-vars') {
    return !!taskVarName.value.trim() && !!taskVarValue.value && createTargets.value.length > 0
  }
  if (createType.value === 'worker-deploy') {
    return !!taskDeployCode.value.trim() && createTargets.value.length > 0
  }
  if (createType.value === 'pages-env') {
    return !!taskEnvKey.value.trim() && !!taskEnvValue.value && createTargets.value.length > 0
  }
  if (TARGET_SELECTOR_TYPES.has(createType.value)) {
    return createTargets.value.length > 0
  }
  return true
})

async function openCreateDialog() {
  createType.value = 'account-check'
  createAccounts.value = []
  createTargets.value = []
  sourceZoneId.value = ''
  taskVarName.value = ''
  taskVarValue.value = ''
  taskVarType.value = 'plain_text'
  taskDeployCode.value = DEFAULT_WORKER_CODE
  taskCompatDate.value = ''
  taskEnvKey.value = ''
  taskEnvValue.value = ''
  taskEnvEnvironment.value = 'production'
  taskTemplateId.value = ''
  taskProxyMode.value = 'on'
  filterRecordType.value = ''
  filterRecordName.value = ''
  await loadTemplates()
  // 提前加载资源列表，便于选择 worker / pages / 域名目标
  if (!resourceStore.workers.loaded) {
    void resourceStore.loadWorkers()
  }
  if (!resourceStore.pages.loaded) {
    void resourceStore.loadPages()
  }
  if (!resourceStore.zones.loaded) {
    void resourceStore.loadZones()
  }
  createVisible.value = true
}

async function createAndRun() {
  const taskType = createType.value
  let items: BatchSubTaskResult[] = []
  const payload: Record<string, unknown> = { accounts: createAccounts.value }

  const accountItems = () =>
    createAccounts.value.map((id) => {
      const acc = accountStore.accounts.find((a) => a.id === id)!
      return { accountId: id, accountName: acc.name, target: acc.name, success: false, finishedAt: 0 }
    })

  const targetItems = () => {
    const selTargets = new Set(createTargets.value)
    return targetOptions.value
      .filter((t) => selTargets.has(`${t.__accountId}/${t.target}`))
      .map((t) => ({
        accountId: t.__accountId ?? '',
        accountName: t.accountName,
        target: t.target,
        success: false,
        finishedAt: 0
      }))
  }

  switch (taskType) {
    case 'account-check':
    case 'account-refresh':
      items = accountItems()
      break
    case 'worker-delete':
    case 'pages-rebuild':
      items = targetItems()
      break
    case 'worker-vars':
      payload.name = taskVarName.value.trim()
      payload.value = taskVarValue.value
      payload.type = taskVarType.value
      items = targetItems()
      break
    case 'worker-deploy':
      payload.code = taskDeployCode.value
      payload.compatDate = taskCompatDate.value.trim()
      items = targetItems()
      break
    case 'pages-env':
      payload.key = taskEnvKey.value.trim()
      payload.value = taskEnvValue.value
      payload.environment = taskEnvEnvironment.value
      items = targetItems()
      break
    case 'waf-sync': {
      const src = zonePool.value.find((z) => z.target === sourceZoneId.value)
      payload.sourceZoneId = sourceZoneId.value
      payload.sourceName = src?.label ?? ''
      items = targetItems()
      break
    }
    case 'template-sync': {
      const tpl = templates.value.find((t) => t.id === taskTemplateId.value)
      if (!tpl) {
        ElMessage.warning('请选择 DNS 模板')
        return
      }
      payload.template = tpl
      items = targetItems()
      break
    }
    case 'dns-update':
      payload.proxied = taskProxyMode.value === 'on'
      items = targetItems()
      break
    case 'dns-delete':
      payload.type = filterRecordType.value || undefined
      payload.name = filterRecordName.value.trim() || undefined
      items = targetItems()
      break
    default:
      ElMessage.warning('暂不支持该任务类型')
      return
  }

  if (!items.length) {
    ElMessage.warning('没有可执行的项目')
    return
  }
  if (taskType === 'worker-delete' || taskType === 'dns-delete') {
    await ElMessageBox.confirm(
      taskType === 'worker-delete'
        ? `确认对 ${items.length} 个 Worker 脚本执行删除？此操作不可恢复。`
        : `确认按所选条件删除 ${items.length} 个域名下的解析记录？此操作不可恢复。`,
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
      dangerous: taskType === 'worker-delete' || taskType === 'dns-delete',
      payload
    })
    batchStore.runTask(task.id, (item, emit) => executeItem(task.id, item, emit))
    const accountNames = createAccounts.value
      .map((id) => accountStore.accounts.find((a) => a.id === id)?.name ?? '')
      .join('、')
    await logStore.write({
      module: 'batch',
      action: '创建批量任务',
      detail: `创建「${TYPE_LABELS[taskType]}」任务，目标账号：${accountNames}，共 ${items.length} 项`,
      level: taskType === 'worker-delete' || taskType === 'dns-delete' ? 'warning' : 'info'
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

/* 新建任务弹窗：任务类型说明 */
.type-desc {
  width: 100%;
  margin-top: 8px;
  padding: 8px 10px;
  border-radius: $radius-sm;
  background: var(--cp-bg-sunken);
  border: 1px dashed var(--cp-border-light);
  color: var(--cp-text-secondary);
  font-size: 12.5px;
  line-height: 1.6;
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
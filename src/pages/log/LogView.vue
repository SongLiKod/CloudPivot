<template>
  <div class="cp-page log-page">
    <!-- 防篡改告警 -->
    <el-alert
      v-if="!logStore.chainValid"
      type="error"
      show-icon
      :closable="false"
      title="检测到日志哈希链不完整"
      description="日志可能被外部修改或数据库损坏，请立即检查本地存储并联系管理员。"
      style="margin-bottom: 12px"
    />

    <!-- 筛选 -->
    <div class="cp-toolbar log-toolbar">
      <el-select v-model="query.level" placeholder="级别" clearable style="width: 110px">
        <el-option label="信息" value="info" />
        <el-option label="警告" value="warning" />
        <el-option label="错误" value="error" />
      </el-select>
      <el-select v-model="query.module" placeholder="模块" clearable style="width: 130px">
        <el-option v-for="m in MODULES" :key="m.value" :label="m.label" :value="m.value" />
      </el-select>
      <el-select v-model="query.accountId" placeholder="账号" clearable filterable style="width: 160px">
        <el-option v-for="acc in accountStore.accounts" :key="acc.id" :label="acc.name" :value="acc.id" />
      </el-select>
      <el-input v-model="query.keyword" placeholder="关键字（操作 / 详情）" clearable class="log-search" />
      <el-date-picker
        v-model="range"
        type="datetimerange"
        start-placeholder="开始时间"
        end-placeholder="结束时间"
        style="width: 340px"
      />
      <el-button type="primary" :loading="logStore.loading" @click="onSearch">查询</el-button>
      <el-button @click="onReset">重置</el-button>
      <div class="cp-flex-1"></div>
      <el-button @click="verifyChain">校验链</el-button>
      <el-button @click="exportLogs">导出 JSON</el-button>
      <el-button type="danger" plain @click="openPrune">清理</el-button>
    </div>

    <!-- 桌面表格 -->
    <template v-if="isDesktop">
      <el-table :data="logStore.rows" class="log-table" v-loading="logStore.loading" @row-click="openDetail">
        <el-table-column v-if="settingsStore.config.showRowIndex" type="index" width="52" align="center" label="#" />
        <el-table-column label="时间" width="170">
          <template #default="{ row }"><span class="cp-text-sm">{{ formatTime(row.time, true) }}</span></template>
        </el-table-column>
        <el-table-column label="级别" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="light" :type="levelTagType(row.level)">{{ levelLabel(row.level) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="模块" width="100">
          <template #default="{ row }">{{ moduleLabel(row.module) }}</template>
        </el-table-column>
        <el-table-column label="账号" min-width="140">
          <template #default="{ row }">{{ row.accountName ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="操作" min-width="140">
          <template #default="{ row }"><span class="cp-text-bold">{{ row.action }}</span></template>
        </el-table-column>
        <el-table-column label="详情" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">{{ row.detail }}</template>
        </el-table-column>
        <el-table-column label="结果" width="90">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :type="row.result === 'success' ? 'success' : 'danger'">
              {{ row.result === 'success' ? '成功' : '失败' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="哈希" width="90">
          <template #default="{ row }"><span class="cp-mono cp-text-sm cp-text-secondary">{{ row.hash.slice(0, 8) }}…</span></template>
        </el-table-column>
      </el-table>
    </template>

    <!-- 移动端列表 -->
    <template v-else>
      <el-empty v-if="!logStore.rows.length && !logStore.loading" description="暂无日志" />
      <div v-for="row in logStore.rows" :key="row.id" class="cp-list-card" @click="openDetail(row)">
        <div class="cp-list-card__head">
          <el-tag size="small" effect="light" :type="levelTagType(row.level)">{{ levelLabel(row.level) }}</el-tag>
          <span class="cp-text-bold">{{ row.action }}</span>
          <span class="cp-list-card__title cp-text-sm" style="font-size: 12px">{{ moduleLabel(row.module) }}</span>
        </div>
        <div class="cp-list-card__row"><span>账号</span><span>{{ row.accountName ?? '-' }}</span></div>
        <div class="cp-list-card__row"><span>时间</span><span>{{ formatTime(row.time, true) }}</span></div>
        <div class="cp-list-card__row cp-ellipsis"><span>详情</span><span>{{ row.detail }}</span></div>
      </div>
    </template>

    <!-- 分页 -->
    <div class="pager">
      <el-pagination
        v-if="isDesktop"
        background
        layout="total, prev, pager, next, sizes"
        :total="logStore.total"
        :current-page="query.page"
        :page-size="query.pageSize"
        :page-sizes="[20, 50, 100]"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
      <template v-else>
        <van-button size="small" plain :disabled="query.page <= 1" @click="prePage">上一页</van-button>
        <span class="cp-text-secondary cp-text-sm">{{ query.page }} / {{ Math.max(1, Math.ceil(logStore.total / query.pageSize)) }}</span>
        <van-button size="small" plain :disabled="query.page * query.pageSize >= logStore.total" @click="nextPage">下一页</van-button>
      </template>
    </div>

    <!-- 清理确认 -->
    <el-dialog v-model="pruneVisible" title="清理日志" width="420px" :append-to-body="true">
      <el-form label-width="80px">
        <el-form-item label="保留天数">
          <el-input-number v-model="retentionDays" :min="1" :max="3650" />
        </el-form-item>
        <p class="cp-text-secondary cp-text-sm">将删除 {{ retentionDays }} 天之前的日志，并重新校验哈希链。</p>
      </el-form>
      <template #footer>
        <el-button @click="pruneVisible = false">取消</el-button>
        <el-button type="danger" :loading="logStore.loading" @click="doPrune">确认清理</el-button>
      </template>
    </el-dialog>

    <!-- 日志详情 -->
    <el-dialog :model-value="detailVisible" title="日志详情" width="560px" :append-to-body="true" @close="detailVisible = false">
      <template v-if="detailRow">
        <el-descriptions :column="1" border size="small">
          <el-descriptions-item label="时间">{{ formatTime(detailRow.time, true) }}</el-descriptions-item>
          <el-descriptions-item label="级别">
            <el-tag size="small" effect="light" :type="levelTagType(detailRow.level)">{{ levelLabel(detailRow.level) }}</el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="模块">【{{ moduleLabel(detailRow.module) }}】{{ detailRow.action }}</el-descriptions-item>
          <el-descriptions-item label="账号">{{ detailRow.accountName ?? '-' }}（{{ detailRow.accountId ?? '-' }}）</el-descriptions-item>
          <el-descriptions-item label="详情">{{ detailRow.detail }}</el-descriptions-item>
          <el-descriptions-item label="结果">{{ detailRow.result === 'success' ? '成功' : '失败' }}</el-descriptions-item>
          <el-descriptions-item label="错误">{{ detailRow.error ?? '-' }}</el-descriptions-item>
          <el-descriptions-item label="哈希"><span class="cp-mono">{{ detailRow.hash }}</span></el-descriptions-item>
          <el-descriptions-item label="上级哈希"><span class="cp-mono">{{ detailRow.prevHash }}</span></el-descriptions-item>
        </el-descriptions>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'LogView' })
import { onMounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { usePlatform } from '@/utils/platform'
import { useAccountStore } from '@/store/useAccountStore'
import { useSettingsStore } from '@/store/useSettingsStore'
import { useLogStore, type LogQuery } from '@/store/useLogStore'
import { formatTime } from '@/utils/format'
import type { LogLevel, OperationLog } from '@/types'

const { isDesktop, isMobile } = usePlatform()
const accountStore = useAccountStore()
const settingsStore = useSettingsStore()
const logStore = useLogStore()

const MODULES = [
  { label: '账号管理', value: 'account' },
  { label: '域名 / DNS', value: 'zones' },
  { label: 'DNS 解析', value: 'dns' },
  { label: 'Workers', value: 'workers' },
  { label: 'Pages', value: 'pages' },
  { label: 'WAF', value: 'waf' },
  { label: '批量任务', value: 'batch' },
  { label: '巡检', value: 'inspection' },
  { label: '模板', value: 'template' },
  { label: '系统', value: 'system' }
]

function moduleLabel(moduleKey: string): string {
  return MODULES.find((m) => m.value === moduleKey)?.label ?? moduleKey
}

function levelLabel(level: LogLevel): string {
  const map: Record<LogLevel, string> = {
    debug: '调试',
    info: '信息',
    success: '成功',
    warning: '警告',
    error: '错误'
  }
  return map[level] ?? level
}

function levelTagType(level: LogLevel): 'info' | 'warning' | 'danger' {
  if (level === 'error') return 'danger'
  if (level === 'warning') return 'warning'
  return 'info'
}

/* ---------------- 筛选 ---------------- */
const range = ref<[Date, Date] | null>(null)
const query = reactive<LogQuery>({
  level: undefined,
  module: undefined,
  accountId: undefined,
  keyword: undefined,
  page: 1,
  pageSize: 50
})

function onSearch() {
  query.page = 1
  applyQuery()
}

function onReset() {
  query.level = undefined
  query.module = undefined
  query.accountId = undefined
  query.keyword = undefined
  range.value = null
  onSearch()
}

function applyQuery() {
  void logStore.query({
    ...query,
    from: range.value?.[0]?.getTime(),
    to: range.value?.[1]?.getTime()
  })
}

function onPageChange(page: number) {
  query.page = page
  applyQuery()
}

function onSizeChange(size: number) {
  query.pageSize = size
  onSearch()
}

function prePage() {
  if (query.page > 1) {
    onPageChange(query.page - 1)
  }
}

function nextPage() {
  if (query.page * query.pageSize < logStore.total) {
    onPageChange(query.page + 1)
  }
}

/* ---------------- 详情 ---------------- */
const detailVisible = ref(false)
const detailRow = ref<OperationLog | null>(null)

function openDetail(row: OperationLog) {
  detailRow.value = row
  detailVisible.value = true
}

/* ---------------- 链校验 ---------------- */
async function verifyChain() {
  const result = await logStore.checkChain()
  if (result.valid) {
    ElMessage.success('日志链校验通过')
  } else {
    ElMessage.error(`日志链校验失败：${result.brokenAt ?? '哈希不连续'}`)
  }
}

/* ---------------- 导出 ---------------- */
function exportLogs() {
  if (!logStore.rows.length) {
    ElMessage.warning('当前没有可导出的日志')
    return
  }
  const payload = {
    exportedAt: Date.now(),
    count: logStore.rows.length,
    logs: logStore.rows
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `cloudpivot-logs-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
  ElMessage.success(`已导出 ${logStore.rows.length} 条日志`)
}

/* ---------------- 清理 ---------------- */
const pruneVisible = ref(false)
const retentionDays = ref(30)

function openPrune() {
  pruneVisible.value = true
}

async function doPrune() {
  const deleted = await logStore.prune(retentionDays.value)
  await logStore.checkChain()
  pruneVisible.value = false
  ElMessage.success(`已清理 ${deleted} 条过期日志`)
  onSearch()
}

onMounted(async () => {
  await accountStore.load()
  await logStore.checkChain()
  await applyQuery()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.log-toolbar {
  flex-wrap: wrap;
  row-gap: 8px;
}

.log-search {
  width: 220px;

  @include mobile {
    width: 100%;
  }
}

.log-table {
  @include card;
}

.pager {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  padding: 14px 0;

  @include mobile {
    justify-content: center;
  }
}
</style>
<template>
  <div class="cp-page dashboard">
    <!-- 统计卡片 -->
    <div class="cp-grid cp-grid--stat">
      <div class="cp-card stat-card">
        <div class="stat-card__label">Cloudflare 账号</div>
        <div class="stat-card__value">{{ accountStore.total }}</div>
        <div class="stat-card__meta">
          <span class="cp-text-primary-color cp-text-bold">{{ accountStore.activeCount }}</span>
          <span> 正常</span>
          <span v-if="abnormalCount" class="cp-text-danger"> · {{ abnormalCount }} 异常</span>
        </div>
      </div>
      <div class="cp-card stat-card">
        <div class="stat-card__label">托管域名</div>
        <div class="stat-card__value">{{ accountStore.zoneCount }}</div>
        <div class="stat-card__meta">
          <span class="cp-text-secondary">{{ activeZones }} 个已激活</span>
        </div>
      </div>
      <div class="cp-card stat-card">
        <div class="stat-card__label">Workers</div>
        <div class="stat-card__value">{{ accountStore.workerCount }}</div>
        <div class="stat-card__meta cp-text-secondary">全部账号脚本总数</div>
      </div>
      <div class="cp-card stat-card">
        <div class="stat-card__label">Pages 项目</div>
        <div class="stat-card__value">{{ accountStore.pagesCount }}</div>
        <div class="stat-card__meta cp-text-secondary">静态站点 / 函数</div>
      </div>
      <div class="cp-card stat-card">
        <div class="stat-card__label">今日请求</div>
        <div class="stat-card__value">{{ formatCompact(lastRequests) }}</div>
        <div class="stat-card__meta cp-text-secondary">缓存命中 {{ formatPercent(cacheHit) }}</div>
      </div>
      <div class="cp-card stat-card">
        <div class="stat-card__label">今日带宽</div>
        <div class="stat-card__value cp-text-sm">{{ formatBytes(lastBandwidth) }}</div>
        <div class="stat-card__meta"><span class="cp-text-danger">{{ formatCompact(lastThreats) }}</span><span> 威胁请求</span></div>
      </div>
    </div>

    <!-- 图表 -->
    <div class="cp-card">
      <div class="cp-card__title">
        <span>近 7 天流量趋势</span>
        <span class="cp-card__title-extra">{{ zoneCount }} 个域名聚合统计</span>
      </div>
      <div ref="chartEl" class="dashboard__chart"></div>
      <el-alert
        v-if="analyticsError"
        :title="analyticsError"
        type="warning"
        :closable="false"
        show-icon
        class="cp-alert-row"
      />
      <div v-if="!analyticsLoading && !hasChartData" class="cp-empty">
        暂无统计数据（需至少 1 个有效域名，或稍后刷新重试）
      </div>
    </div>

    <!-- 下栏 -->
    <div class="dashboard-cols">
      <div class="cp-card">
        <div class="cp-card__title">
          <span>异常账号</span>
          <router-link class="cp-text-sm" to="/accounts">前往处理</router-link>
        </div>
        <div v-if="unknownCount" class="cp-text-sm cp-text-secondary" style="padding-bottom: 6px">
          另有 {{ unknownCount }} 个账号待检测（可在账号管理触发批量检测）
        </div>
        <div v-if="!abnormalAccounts.length" class="cp-empty">所有账号状态正常</div>
        <div v-for="acc in abnormalAccounts" :key="acc.id" class="health-row">
          <span class="cp-dot" :class="dotClass(acc.status)"></span>
          <span class="cp-flex-1 cp-ellipsis">{{ acc.name }}</span>
          <span class="cp-text-secondary cp-text-sm">{{ acc.statusMessage || statusLabel(acc.status) }}</span>
        </div>
      </div>

      <div class="cp-card">
        <div class="cp-card__title">
          <span>巡检告警</span>
          <router-link v-if="issues.length" class="cp-text-sm" to="/logs">{{ issues.length }} 条</router-link>
        </div>
        <div v-if="!issues.length" class="cp-empty">暂无巡检告警</div>
        <div v-for="issue in issues" :key="issue.id" class="health-row">
          <span class="cp-dot" :class="issue.level === 'error' ? 'is-error' : 'is-warning'"></span>
          <span class="cp-flex-1 cp-ellipsis">{{ issue.title }}</span>
          <span class="cp-text-secondary cp-text-sm">{{ formatRelative(issue.detectedAt) }}</span>
        </div>
      </div>

      <div class="cp-card">
        <div class="cp-card__title"><span>快捷操作</span></div>
        <div class="quick-grid">
          <router-link class="quick-item" to="/accounts">
            <el-icon><Plus /></el-icon><span>添加账号</span>
          </router-link>
          <router-link class="quick-item" to="/dns">
            <el-icon><Connection /></el-icon><span>域名管理</span>
          </router-link>
          <router-link class="quick-item" to="/workers">
            <el-icon><Cpu /></el-icon><span>部署 Worker</span>
          </router-link>
          <router-link class="quick-item" to="/batch">
            <el-icon><Operation /></el-icon><span>批量任务</span>
          </router-link>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
defineOptions({ name: 'DashboardView' })
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { EChartsCoreOption } from 'echarts/core'
import { useAccountStore } from '@/store/useAccountStore'
import { useResourceStore } from '@/store/useResourceStore'
import { useThemeStore } from '@/store/useThemeStore'
import { listInspectionIssues } from '@/utils/db'
import { buildRequestContext } from '@/store/credentialService'
import { runWithConcurrency } from '@/utils/scheduler'
import { getZoneAnalyticsReports } from '@/api/analytics'
import { formatBytes, formatCompact, formatPercent, formatRelative } from '@/utils/format'
import type { AccountStatus, InspectionIssue } from '@/types'

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  CanvasRenderer
])

const accountStore = useAccountStore()
const resourceStore = useResourceStore()
const themeStore = useThemeStore()

const chartEl = ref<HTMLDivElement | null>(null)
const analyticsLoading = ref(false)
const hasChartData = ref(false)
const analyticsError = ref('')
const checkingStale = ref(false)

const chartData = ref<{
  times: string[]
  requests: number[]
  cached: number[]
  threats: number[]
  bandwidth: number[]
}>({ times: [], requests: [], cached: [], threats: [], bandwidth: [] })

const issues = ref<InspectionIssue[]>([])

let chart: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null

const abnormalCount = computed(() => accountStore.abnormalCount)
const abnormalAccounts = computed(() =>
  accountStore.accounts
    .filter((a) => a.status !== 'active' && a.status !== 'unknown')
    .slice(0, 6)
)
const unknownCount = computed(
  () => accountStore.accounts.filter((a) => a.status === 'unknown').length
)
const activeZones = computed(
  () => resourceStore.zones.rows.filter((z) => z.status === 'active' && !z.paused).length
)
const zoneCount = computed(() => resourceStore.zones.rows.length)
const lastRequests = computed(() => chartData.value.requests.at(-1) ?? 0)
const lastBandwidth = computed(() => chartData.value.bandwidth.at(-1) ?? 0)
const lastThreats = computed(() => chartData.value.threats.at(-1) ?? 0)
const cacheHit = computed(() => {
  const last = chartData.value.requests.at(-1) ?? 0
  const cached = chartData.value.cached.at(-1) ?? 0
  if (!last) return 0
  return cached / last
})

function statusLabel(status: AccountStatus): string {
  const map: Record<AccountStatus, string> = {
    active: '正常',
    invalid: '凭据失效',
    forbidden: '权限不足',
    expired: 'Token 过期',
    unknown: '未检测'
  }
  return map[status] ?? status
}

function dotClass(status: AccountStatus): string {
  if (status === 'active') return 'is-online'
  if (status === 'forbidden' || status === 'expired') return 'is-warning'
  return 'is-error'
}

/** 聚合多个域名的近 7 天统计 */
async function loadAnalytics() {
  analyticsLoading.value = true
  analyticsError.value = ''
  try {
    const zones = resourceStore.zones.rows
      .filter((z) => z.status === 'active' && !z.paused && z.__accountId)
      .slice(0, 5)
    const aggregates = new Map<string, { requests: number; cached: number; threats: number; bandwidth: number }>()
    let times: string[] = []
    const failures: string[] = []

    for (const zone of zones) {
      const account = accountStore.accounts.find((a) => a.id === zone.__accountId)
      if (!account) continue
      try {
        const ctx = await buildRequestContext(account)
        const until = new Date()
        const since = new Date(until.getTime() - 7 * 86400000)
        const data = await getZoneAnalyticsReports(ctx, zone.id, {
          since: since.toISOString(),
          until: until.toISOString()
        })
        for (const bucket of data.timeseries ?? []) {
          const label = (bucket.since ?? '').slice(0, 10)
          if (!times.includes(label)) times.push(label)
          const entry = aggregates.get(label) ?? { requests: 0, cached: 0, threats: 0, bandwidth: 0 }
          entry.requests += bucket.requests?.all ?? 0
          entry.cached += bucket.requests?.cached ?? 0
          entry.threats += bucket.threats?.all ?? 0
          entry.bandwidth += bucket.bandwidth?.all ?? 0
          aggregates.set(label, entry)
        }
      } catch (error) {
        // 暴露真实失败原因，避免“有域名却始终无数据且无提示”
        failures.push(`${zone.name}：${(error as Error).message}`)
      }
    }

    if (failures.length) {
      analyticsError.value =
        failures.length > 2
          ? `部分域名统计拉取失败（共 ${failures.length} 个）：${failures
              .slice(0, 2)
              .join('；')} 等`
          : `域名统计拉取失败：${failures.join('；')}`
    }

    times.sort()
    chartData.value = {
      times,
      requests: times.map((t) => aggregates.get(t)?.requests ?? 0),
      cached: times.map((t) => aggregates.get(t)?.cached ?? 0),
      threats: times.map((t) => aggregates.get(t)?.threats ?? 0),
      bandwidth: times.map((t) => aggregates.get(t)?.bandwidth ?? 0)
    }
    hasChartData.value = times.length > 0
    await nextTick()
    renderChart()
  } finally {
    analyticsLoading.value = false
  }
}

function renderChart() {
  if (!chartEl.value) return
  if (!chart) {
    chart = echarts.init(chartEl.value)
  }
  const dark = themeStore.isDark
  const option: EChartsCoreOption = {
    color: ['#22c55e', '#60a5fa', '#f59e0b'],
    tooltip: { trigger: 'axis' },
    legend: {
      data: ['请求数', '缓存命中', '威胁请求'],
      textStyle: { color: dark ? '#9ca3af' : '#6b7280' },
      top: 0
    },
    grid: { left: 46, right: 16, top: 36, bottom: 28 },
    xAxis: {
      type: 'category',
      data: chartData.value.times,
      axisLine: { lineStyle: { color: dark ? '#4b5563' : '#d1d5db' } },
      axisLabel: { color: dark ? '#9ca3af' : '#6b7280' }
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: dark ? '#2b3442' : '#eef0f3' } },
      axisLabel: { color: dark ? '#9ca3af' : '#6b7280' }
    },
    series: [
      { name: '请求数', type: 'line', smooth: true, data: chartData.value.requests },
      { name: '缓存命中', type: 'line', smooth: true, data: chartData.value.cached },
      { name: '威胁请求', type: 'bar', data: chartData.value.threats, barMaxWidth: 14 }
    ]
  }
  chart.setOption(option, true)
}

async function refresh() {
  await Promise.all([accountStore.load(), resourceStore.loadZones()])
  await Promise.all([loadAnalytics(), refreshAccountStatuses()])
}

/** 后台重检过期/未检测账号，使「异常账号」保持准确（不写操作日志） */
async function refreshAccountStatuses() {
  if (checkingStale.value) return
  const stale = accountStore.accounts.filter(
    (a) => a.status === 'unknown' || !a.lastCheckedAt || Date.now() - (a.lastCheckedAt ?? 0) > 60 * 60 * 1000
  )
  if (!stale.length) return
  checkingStale.value = true
  try {
    await runWithConcurrency(stale, 4, async (account) => {
      try {
        const result = await accountStore.verifyCredential(account)
        const updated = {
          ...account,
          status: result.status,
          statusMessage: result.statusMessage,
          cfAccountId: result.cfAccountId ?? account.cfAccountId,
          lastCheckedAt: Date.now()
        }
        await accountStore.persistAccount(updated)
      } catch {
        /* 忽略单个账号检测失败 */
      }
    })
  } finally {
    checkingStale.value = false
  }
}

onMounted(async () => {
  await accountStore.load()
  if (!resourceStore.zones.loaded) {
    await resourceStore.loadZones()
  }
  await Promise.all([loadAnalytics(), refreshAccountStatuses()])

  issues.value = await listInspectionIssues(true).catch(() => [])

  if (chartEl.value) {
    resizeObserver = new ResizeObserver(() => chart?.resize())
    resizeObserver.observe(chartEl.value)
  }
})

watch(
  () => themeStore.isDark,
  () => {
    renderChart()
  }
)

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  chart?.dispose()
  chart = null
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.dashboard-cols {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.stat-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 14px 16px;

  &__label {
    font-size: 12.5px;
    color: var(--cp-text-secondary);
  }
  &__value {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--cp-text-primary);
  }
  &__meta {
    font-size: 12px;
    color: var(--cp-text-placeholder);
  }
}

.dashboard__chart {
  width: 100%;
  height: 300px;
}

.health-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 0;
  border-bottom: 1px dashed var(--cp-border-light);
  font-size: 13px;

  &:last-child {
    border-bottom: none;
  }
}

.quick-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.quick-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: $radius-sm;
  background: var(--cp-bg-sunken);
  color: var(--cp-text-regular);
  font-size: 13px;
  transition: all 0.15s;

  &:hover {
    color: var(--cp-primary);
    background: var(--cp-primary-bg);
  }
}
</style>
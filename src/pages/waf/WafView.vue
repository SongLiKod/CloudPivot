<template>
  <div class="cp-page waf-page">
    <div class="cp-toolbar">
      <el-select v-model="zoneId" placeholder="选择域名" filterable style="width: 260px">
        <el-option
          v-for="zone in zoneOptions"
          :key="zone.id"
          :label="`${zone.name}（${accountName(zone.__accountId)}）`"
          :value="zone.id"
        />
      </el-select>
      <el-button :loading="ruleLoading" @click="onRefreshRules">刷新</el-button>
      <div class="cp-flex-1"></div>
      <el-button type="primary" :disabled="!zoneId" @click="openRuleDialog()">
        <el-icon><Plus /></el-icon>新增规则
      </el-button>
      <el-button :disabled="!zoneId" @click="openBulkImport">
        <el-icon><Upload /></el-icon>批量导入 IP
      </el-button>
    </div>

    <el-empty v-if="!zoneOptions.length" description="暂无域名，请先在「域名 DNS」中刷新" />

    <template v-else>
      <!-- 桌面 Tabs -->
      <el-tabs v-if="isDesktop" v-model="activeTab">
        <el-tab-pane label="IP 访问规则" name="access">
          <el-table :data="accessRules" v-loading="ruleLoading" class="waf-table">
            <el-table-column label="对象" min-width="200">
              <template #default="{ row }">
                <el-tag size="small" effect="plain" :type="targetTagType(row.configuration?.target)" class="target-tag">
                  {{ targetLabel(row.configuration?.target) }}
                </el-tag>
                <span class="cp-mono">{{ row.configuration?.value }}</span>
              </template>
            </el-table-column>
            <el-table-column label="动作" width="150">
              <template #default="{ row }">
                <el-tag size="small" effect="light" :type="modeTagType(row.mode)">{{ modeLabel(row.mode) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="备注" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ row.notes ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="创建时间" min-width="170">
              <template #default="{ row }">{{ formatTime(row.created_on, false) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="openRuleDialog(row)">编辑</el-button>
                <el-button size="small" text type="danger" @click="removeRule(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <el-tab-pane label="速率限制" name="limits">
          <el-table :data="rateLimits" v-loading="ruleLoading" class="waf-table">
            <el-table-column label="描述" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ row.description ?? '-' }}</template>
            </el-table-column>
            <el-table-column label="匹配 URL" min-width="200">
              <template #default="{ row }">
                <span class="cp-mono cp-text-sm">{{ rateLimitUrl(row) }}</span>
              </template>
            </el-table-column>
            <el-table-column label="阈值" width="140">
              <template #default="{ row }">{{ row.limit ?? '-' }} 次 / {{ ratePeriodLabel(row.period) }}</template>
            </el-table-column>
            <el-table-column label="动作" width="120">
              <template #default="{ row }">
                <el-tag size="small" effect="light" :type="limitModeTagType(row.action?.mode)">{{ limitModeLabel(row.action?.mode) }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="启用" width="80">
              <template #default="{ row }">
                <el-switch
                  :model-value="!row.disabled"
                  size="small"
                  @change="(v: string | number | boolean) => toggleRateLimit(row, !!v)"
                />
              </template>
            </el-table-column>
            <el-table-column label="操作" width="130" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text type="primary" @click="openLimitDialog(row)">编辑</el-button>
                <el-button size="small" text type="danger" @click="removeRateLimit(row)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>
      </el-tabs>

      <!-- 移动端 Tabs -->
      <template v-else>
        <van-tabs v-model:active="mobileTab">
          <van-tab title="IP 规则">
            <div class="tab-pad">
              <el-empty v-if="!accessRules.length" description="暂无 IP 访问规则" />
              <div v-for="row in accessRules" :key="row.id" class="cp-list-card">
                <div class="cp-list-card__head">
                  <span class="cp-text-sm">{{ targetLabel(row.configuration?.target) }}</span>
                  <el-tag size="small" effect="light" :type="modeTagType(row.mode)">{{ modeLabel(row.mode) }}</el-tag>
                </div>
                <div class="cp-list-card__row"><span>对象</span><span class="cp-mono">{{ row.configuration?.value }}</span></div>
                <div class="cp-list-card__row"><span>备注</span><span class="cp-ellipsis">{{ row.notes ?? '-' }}</span></div>
                <div class="cp-list-card__actions">
                  <van-button size="mini" type="primary" plain @click="openRuleDialog(row)">编辑</van-button>
                  <van-button size="mini" type="danger" plain @click="removeRule(row)">删除</van-button>
                </div>
              </div>
            </div>
          </van-tab>
          <van-tab title="速率限制">
            <div class="tab-pad">
              <el-empty v-if="!rateLimits.length" description="暂无速率限制规则" />
              <div v-for="row in rateLimits" :key="row.id" class="cp-list-card">
                <div class="cp-list-card__head">
                  <span class="cp-list-card__title">{{ row.description ?? '未命名规则' }}</span>
                  <el-switch :model-value="!row.disabled" size="small" @change="(v: string | number | boolean) => toggleRateLimit(row, !!v)" />
                </div>
                <div class="cp-list-card__row"><span>匹配</span><span class="cp-mono cp-ellipsis">{{ rateLimitUrl(row) }}</span></div>
                <div class="cp-list-card__row"><span>阈值</span><span>{{ row.limit ?? '-' }} 次 / {{ ratePeriodLabel(row.period) }} · {{ limitModeLabel(row.action?.mode) }}</span></div>
                <div class="cp-list-card__actions">
                  <van-button size="mini" type="primary" plain @click="openLimitDialog(row)">编辑</van-button>
                  <van-button size="mini" type="danger" plain @click="removeRateLimit(row)">删除</van-button>
                </div>
              </div>
            </div>
          </van-tab>
        </van-tabs>
      </template>
    </template>

    <!-- 新增 / 编辑 IP 规则 -->
    <el-dialog
      :model-value="ruleDialogVisible"
      :title="editingRule ? '编辑 IP 规则' : '新增 IP 规则'"
      width="480px"
      :append-to-body="true"
      @close="ruleDialogVisible = false"
    >
      <el-form label-width="70px" label-position="left">
        <el-form-item label="动作">
          <el-select v-model="ruleForm.mode" style="width: 100%">
            <el-option label="阻止（block）" value="block" />
            <el-option label="白名单（whitelist）" value="whitelist" />
            <el-option label="挑战（challenge）" value="challenge" />
            <el-option label="JS 挑战（js_challenge）" value="js_challenge" />
            <el-option label="托管挑战（managed_challenge）" value="managed_challenge" />
          </el-select>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="ruleForm.target" style="width: 100%" :disabled="!!editingRule">
            <el-option label="IP 地址" value="ip" />
            <el-option label="IP 网段" value="ip_range" />
            <el-option label="ASN" value="asn" />
            <el-option label="国家 / 地区" value="country" />
          </el-select>
        </el-form-item>
        <el-form-item label="对象值">
          <el-input
            v-model="ruleForm.value"
            class="cp-mono"
            :placeholder="ruleForm.target === 'country' ? '如 CN' : '如 1.2.3.4 / 203.0.113.0/24 / AS13335'"
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="ruleForm.notes" placeholder="可选备注" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="ruleDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingRule" :disabled="!ruleForm.value.trim()" @click="saveRule">
          {{ editingRule ? '保存' : '新增' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 新增 / 编辑速率限制 -->
    <el-dialog
      :model-value="limitDialogVisible"
      :title="editingLimit ? '编辑速率限制' : '新增速率限制'"
      width="480px"
      :append-to-body="true"
      @close="limitDialogVisible = false"
    >
      <el-form label-width="80px" label-position="left">
        <el-form-item label="描述">
          <el-input v-model="limitForm.description" placeholder="规则用途说明" />
        </el-form-item>
        <el-form-item label="URL 规则">
          <el-input v-model="limitForm.url" class="cp-mono" placeholder="如 example.com/api/* 或 *（全站）" />
        </el-form-item>
        <el-form-item label="时间窗口">
          <el-select v-model="limitForm.period" style="width: 100%">
            <el-option label="10 秒" :value="10" />
            <el-option label="1 分钟" :value="60" />
            <el-option label="10 分钟" :value="600" />
            <el-option label="1 小时" :value="3600" />
            <el-option label="1 天" :value="86400" />
          </el-select>
        </el-form-item>
        <el-form-item label="请求阈值">
          <el-input-number v-model="limitForm.limit" :min="1" :max="100000" style="width: 100%" />
        </el-form-item>
        <el-form-item label="处理动作">
          <el-select v-model="limitForm.actionMode" style="width: 100%">
            <el-option label="模拟（仅记录）" value="simulate" />
            <el-option label="阻止（ban）" value="ban" />
            <el-option label="挑战（challenge）" value="challenge" />
            <el-option label="JS 挑战" value="js_challenge" />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="limitDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingLimit" @click="saveLimit">保存</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入 IP -->
    <el-dialog v-model="bulkVisible" title="批量导入 IP 规则" width="520px" :append-to-body="true">
      <el-select v-model="bulkMode" style="width: 100%; margin-bottom: 10px">
        <el-option label="阻止（block）" value="block" />
        <el-option label="白名单（whitelist）" value="whitelist" />
        <el-option label="挑战（challenge）" value="challenge" />
      </el-select>
      <el-input
        v-model="bulkText"
        type="textarea"
        :rows="8"
        placeholder="每行一个 IP 或网段，如：&#10;1.2.3.4&#10;203.0.113.0/24&#10;# 以 # 开头的行会跳过"
        class="cp-mono"
      />
      <template #footer>
        <el-button @click="bulkVisible = false">取消</el-button>
        <el-button type="primary" :loading="bulkSaving" :disabled="!bulkLines.length" @click="doBulkImport">
          导入 {{ bulkLines.length }} 条
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Plus, Upload } from '@element-plus/icons-vue'
import { usePlatform } from '@/utils/platform'
import { useAccountStore } from '@/store/useAccountStore'
import { useResourceStore } from '@/store/useResourceStore'
import { useLogStore } from '@/store/useLogStore'
import { buildRequestContext } from '@/store/credentialService'
import * as wafApi from '@/api/waf'
import { formatTime } from '@/utils/format'
import type { CfAccessRule, CfRateLimit } from '@/types'

const { isDesktop, isMobile } = usePlatform()
const accountStore = useAccountStore()
const resourceStore = useResourceStore()
const logStore = useLogStore()

const zoneId = ref('')
const activeTab = ref('access')
const mobileTab = ref(0)
const ruleLoading = ref(false)
const accessRules = ref<CfAccessRule[]>([])
const rateLimits = ref<CfRateLimit[]>([])

const zoneOptions = computed(() =>
  resourceStore.zones.rows.filter((z) => z.status === 'active')
)

const currentZone = computed(() => zoneOptions.value.find((z) => z.id === zoneId.value) ?? null)
const currentAccount = computed(() => {
  const zone = currentZone.value
  return zone ? accountStore.accounts.find((a) => a.id === zone.__accountId) : undefined
})

function accountName(accountId?: string): string {
  if (!accountId) return '-'
  return accountStore.accounts.find((a) => a.id === accountId)?.name ?? '未知账号'
}

/* ---------------- 标签工具 ---------------- */
const MODE_LABELS: Record<string, string> = {
  block: '阻止',
  challenge: '挑战',
  whitelist: '白名单',
  js_challenge: 'JS 挑战',
  managed_challenge: '托管挑战'
}
const TARGET_LABELS: Record<string, string> = {
  ip: 'IP',
  ip_range: 'IP 网段',
  asn: 'ASN',
  country: '国家'
}

function modeLabel(mode?: string): string {
  return mode ? (MODE_LABELS[mode] ?? mode) : '-'
}
function targetLabel(target?: string): string {
  return target ? (TARGET_LABELS[target] ?? target) : '-'
}
function modeTagType(mode?: string): 'danger' | 'success' | 'warning' | 'info' {
  if (mode === 'block') return 'danger'
  if (mode === 'whitelist') return 'success'
  if (mode === 'challenge' || mode === 'js_challenge' || mode === 'managed_challenge') return 'warning'
  return 'info'
}
function targetTagType(target?: string): 'primary' | 'success' | 'info' {
  if (target === 'ip' || target === 'ip_range') return 'primary'
  if (target === 'country') return 'success'
  return 'info'
}
function limitModeLabel(mode?: string): string {
  const map: Record<string, string> = {
    simulate: '模拟',
    ban: '阻止',
    challenge: '挑战',
    js_challenge: 'JS 挑战'
  }
  return mode ? (map[mode] ?? mode) : '-'
}
function limitModeTagType(mode?: string): 'warning' | 'danger' | 'info' {
  if (mode === 'simulate') return 'warning'
  if (mode === 'ban') return 'danger'
  return 'info'
}
function ratePeriodLabel(period?: number): string {
  switch (period) {
    case 10:
      return '10 秒'
    case 60:
      return '1 分钟'
    case 600:
      return '10 分钟'
    case 3600:
      return '1 小时'
    case 86400:
      return '1 天'
    default:
      return `${period ?? '-'} 秒`
  }
}
function rateLimitUrl(row: CfRateLimit): string {
  const request = (row.match as { request?: { url?: string } } | undefined)?.request
  return request?.url ?? '*'
}

/* ---------------- 数据加载 ---------------- */
async function loadRules() {
  const account = currentAccount.value
  if (!account || !zoneId.value) return
  ruleLoading.value = true
  try {
    const ctx = await buildRequestContext(account)
    accessRules.value = await wafApi.listAccessRules(ctx, zoneId.value)
    rateLimits.value = await wafApi.listRateLimits(ctx, zoneId.value).catch(() => [])
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    ruleLoading.value = false
  }
}

function onRefreshRules() {
  return loadRules()
}

/* ---------------- IP 规则 CRUD ---------------- */
const ruleDialogVisible = ref(false)
const editingRule = ref<CfAccessRule | null>(null)
const savingRule = ref(false)
const ruleForm = reactive({ mode: 'block', target: 'ip', value: '', notes: '' })

function openRuleDialog(rule?: CfAccessRule) {
  editingRule.value = rule ?? null
  ruleForm.mode = rule?.mode ?? 'block'
  ruleForm.target = rule?.configuration?.target ?? 'ip'
  ruleForm.value = rule?.configuration?.value ?? ''
  ruleForm.notes = rule?.notes ?? ''
  ruleDialogVisible.value = true
}

async function saveRule() {
  const account = currentAccount.value
  if (!account || !zoneId.value) return
  savingRule.value = true
  try {
    const ctx = await buildRequestContext(account)
    const payload = {
      mode: ruleForm.mode as wafApi.AccessRulePayload['mode'],
      configuration: { target: ruleForm.target as wafApi.AccessRulePayload['configuration']['target'], value: ruleForm.value.trim() },
      notes: ruleForm.notes.trim() || undefined
    }
    if (editingRule.value) {
      await wafApi.updateAccessRule(ctx, zoneId.value, editingRule.value.id, payload)
    } else {
      await wafApi.createAccessRule(ctx, zoneId.value, payload)
    }
    ruleDialogVisible.value = false
    await loadRules()
    ElMessage.success('已保存')
    await logStore.write({
      module: 'waf',
      action: editingRule.value ? '编辑 IP 规则' : '新增 IP 规则',
      detail: `${targetLabel(payload.configuration.target)} ${payload.configuration.value}（${modeLabel(payload.mode)}）@${currentZone.value?.name}`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    savingRule.value = false
  }
}

async function removeRule(rule: CfAccessRule) {
  const account = currentAccount.value
  if (!account || !zoneId.value) return
  await ElMessageBox.confirm(`删除规则「${rule.configuration?.value ?? rule.id}」？`, '删除规则', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await wafApi.deleteAccessRule(ctx, zoneId.value, rule.id)
    await loadRules()
    ElMessage.success('已删除')
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 速率限制 CRUD ---------------- */
const limitDialogVisible = ref(false)
const editingLimit = ref<CfRateLimit | null>(null)
const savingLimit = ref(false)
const limitForm = reactive({
  description: '',
  url: '*',
  period: 60,
  limit: 100,
  actionMode: 'simulate'
})

function openLimitDialog(limit?: CfRateLimit) {
  editingLimit.value = limit ?? null
  limitForm.description = limit?.description ?? ''
  limitForm.url = rateLimitUrl(limit as CfRateLimit)
  limitForm.period = (limit?.period as 10 | 60 | 600 | 3600 | 86400) ?? 60
  limitForm.limit = limit?.limit ?? 100
  limitForm.actionMode = limit?.action?.mode ?? 'simulate'
  limitDialogVisible.value = true
}

async function saveLimit() {
  const account = currentAccount.value
  if (!account || !zoneId.value) return
  savingLimit.value = true
  try {
    const ctx = await buildRequestContext(account)
    const payload: wafApi.RateLimitPayload = {
      description: limitForm.description.trim() || undefined,
      match: { request: { url: limitForm.url.trim() || '*' } },
      action: { mode: limitForm.actionMode as wafApi.RateLimitPayload['action']['mode'] },
      period: limitForm.period as wafApi.RateLimitPayload['period'],
      limit: limitForm.limit,
      disabled: false
    }
    if (editingLimit.value) {
      await wafApi.updateRateLimit(ctx, zoneId.value, editingLimit.value.id, payload)
    } else {
      await wafApi.createRateLimit(ctx, zoneId.value, payload)
    }
    limitDialogVisible.value = false
    await loadRules()
    ElMessage.success('已保存')
    await logStore.write({
      module: 'waf',
      action: editingLimit.value ? '编辑速率限制' : '新增速率限制',
      detail: `${limitForm.url}（${limitForm.limit}/${ratePeriodLabel(limitForm.period)}）@${currentZone.value?.name}`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    savingLimit.value = false
  }
}

async function toggleRateLimit(limit: CfRateLimit, enabled: boolean) {
  const account = currentAccount.value
  if (!account || !zoneId.value) return
  try {
    const ctx = await buildRequestContext(account)
    await wafApi.updateRateLimit(ctx, zoneId.value, limit.id, {
      description: limit.description,
      match: { request: { url: rateLimitUrl(limit) } },
      action: { mode: (limit.action?.mode ?? 'simulate') as wafApi.RateLimitPayload['action']['mode'] },
      period: (limit.period ?? 60) as wafApi.RateLimitPayload['period'],
      limit: limit.limit,
      disabled: !enabled
    })
    await loadRules()
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

async function removeRateLimit(limit: CfRateLimit) {
  const account = currentAccount.value
  if (!account || !zoneId.value) return
  await ElMessageBox.confirm(`删除速率限制「${limit.description ?? limit.id}」？`, '删除规则', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await wafApi.deleteRateLimit(ctx, zoneId.value, limit.id)
    await loadRules()
    ElMessage.success('已删除')
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 批量导入 ---------------- */
const bulkVisible = ref(false)
const bulkMode = ref('block')
const bulkText = ref('')
const bulkSaving = ref(false)

const bulkLines = computed(() =>
  bulkText.value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
)

function openBulkImport() {
  bulkText.value = ''
  bulkMode.value = 'block'
  bulkVisible.value = true
}

async function doBulkImport() {
  const account = currentAccount.value
  if (!account || !zoneId.value) return
  bulkSaving.value = true
  try {
    const ctx = await buildRequestContext(account)
    const payloads: wafApi.AccessRulePayload[] = bulkLines.value.map((value) => ({
      mode: bulkMode.value as wafApi.AccessRulePayload['mode'],
      configuration: { target: 'ip' as const, value },
      notes: '批量导入'
    }))
    const result = await wafApi.createAccessRulesBulk(ctx, zoneId.value, payloads)
    await loadRules()
    if (result.fails.length) {
      ElMessage.warning(`成功 ${result.ok} 条，失败 ${result.fails.length} 条：${result.fails[0].message}`)
    } else {
      ElMessage.success(`已导入 ${result.ok} 条规则`)
    }
    await logStore.write({
      module: 'waf',
      action: '批量导入 IP 规则',
      detail: `在「${currentZone.value?.name}」批量导入 ${result.ok} 条 IP 规则`,
      accountId: account.id,
      accountName: account.name
    })
    bulkVisible.value = false
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    bulkSaving.value = false
  }
}

/* ---------------- 初始化 ---------------- */
onMounted(async () => {
  await accountStore.load()
  if (!resourceStore.zones.loaded) {
    await resourceStore.loadZones()
  }
  if (!zoneId.value && zoneOptions.value.length) {
    zoneId.value = zoneOptions.value[0].id
  }
  if (zoneId.value) {
    await loadRules()
  }
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.waf-table {
  @include card;
}

.tab-pad {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;

  @include mobile {
    padding-top: 18px;
  }
}

.target-tag {
  margin-right: 8px;
}
</style>
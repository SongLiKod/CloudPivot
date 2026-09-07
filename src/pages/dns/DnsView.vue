<template>
  <div class="cp-page dns-page">
    <!-- ================= 域名列表（/dns） ================= -->
    <template v-if="!zoneId">
      <div class="cp-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索域名"
          clearable
          class="zone-search"
          :prefix-icon="'Search'"
        />
        <el-select v-model="statusFilter" placeholder="状态" clearable style="width: 130px">
          <el-option label="已激活" value="active" />
          <el-option label="待激活" value="pending" />
          <el-option label="已暂停" value="paused" />
          <el-option label="已移走" value="moved" />
          <el-option label="已删除" value="deleted" />
        </el-select>
        <el-select v-model="accountFilter" placeholder="全部账号" clearable style="width: 160px">
          <el-option v-for="acc in accountStore.accounts" :key="acc.id" :label="acc.name" :value="acc.id" />
        </el-select>
        <div class="cp-flex-1"></div>
        <el-button type="primary" @click="openZoneDialog">
          <el-icon><Plus /></el-icon>添加域名
        </el-button>
        <el-button :loading="resourceStore.zones.loading" @click="onRefreshZones">刷新</el-button>
      </div>

      <el-alert v-if="resourceStore.zones.error" :title="resourceStore.zones.error" type="error" :closable="false" show-icon class="cp-alert-row" />

      <!-- 桌面表格 -->
      <template v-if="isDesktop">
        <el-table :data="filteredZones" v-loading="resourceStore.zones.loading" class="zone-table">
          <el-table-column label="域名" min-width="220">
            <template #default="{ row }">
              <router-link :to="`/dns/${row.id}`" class="zone-name cp-text-bold">{{ row.name }}</router-link>
              <div class="cp-text-sm cp-text-secondary cp-mono">{{ row.id }}</div>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="130">
            <template #default="{ row }">
              <el-tag size="small" effect="light" :type="zoneTagType((row as CfZone).status)" :class="{ 'is-muted': row.paused }">
                {{ zoneStatusLabel(row as CfZone) }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="账号" min-width="140">
            <template #default="{ row }">{{ accountName(row.__accountId) }}</template>
          </el-table-column>
          <el-table-column label="套餐" width="110">
            <template #default="{ row }">{{ row.plan?.name ?? '-' }}</template>
          </el-table-column>
          <el-table-column label="Nameservers" min-width="220">
            <template #default="{ row }">
              <div v-if="row.name_servers?.length" class="cp-mono cp-text-sm">{{ row.name_servers.join('  ') }}</div>
              <span v-else class="cp-text-secondary cp-text-sm">-</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="240" fixed="right">
            <template #default="{ row }">
              <el-button size="small" type="primary" text @click="goDetail(row as CfZone)">DNS 解析</el-button>
              <el-button size="small" text @click="viewCert(row as CfZone)">证书</el-button>
              <el-button size="small" text @click="togglePause(row as CfZone)">
                {{ row.paused ? '恢复' : '暂停' }}
              </el-button>
              <el-button size="small" text type="danger" @click="removeZone(row as CfZone)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 移动端列表 -->
      <template v-else>
        <el-empty v-if="!filteredZones.length" description="暂无域名" />
        <template v-for="row in filteredZones" :key="row.id">
          <div class="cp-list-card" @click="goDetail(row)">
            <div class="cp-list-card__head">
              <span class="cp-list-card__title">{{ row.name }}</span>
              <el-tag size="small" effect="light" :type="zoneTagType(row.status)">{{ zoneStatusLabel(row) }}</el-tag>
            </div>
            <div class="cp-list-card__row"><span>账号</span><span>{{ accountName(row.__accountId) }}</span></div>
            <div class="cp-list-card__row"><span>套餐</span><span>{{ row.plan?.name ?? '-' }}</span></div>
            <div class="cp-list-card__actions">
              <van-button size="mini" type="primary" plain @click.stop="togglePause(row)">{{ row.paused ? '恢复' : '暂停' }}</van-button>
              <van-button size="mini" type="danger" plain @click.stop="removeZone(row)">删除</van-button>
            </div>
          </div>
        </template>
      </template>
    </template>

    <!-- ================= DNS 解析详情（/dns/:zoneId） ================= -->
    <template v-else>
      <div class="dns-head">
        <el-button link @click="backToList">
          <el-icon><ArrowLeft /></el-icon>&nbsp;返回
        </el-button>
        <div class="dns-head__info">
          <span class="cp-text-bold cp-text-lg">{{ currentZone?.name ?? 'DNS 解析' }}</span>
          <el-tag v-if="currentZone" size="small" effect="light" :type="zoneTagType(currentZone.status)">
            {{ zoneStatusLabel(currentZone) }}
          </el-tag>
          <span v-if="currentZone" class="cp-text-secondary cp-text-sm">{{ accountName(currentZone.__accountId) }}</span>
        </div>
        <div class="cp-flex-1"></div>
        <el-button :loading="dnsLoading" @click="reloadDns()">刷新</el-button>
      </div>

      <div class="cp-toolbar">
        <el-input v-model="recordKeyword" placeholder="筛选记录" clearable class="record-search" :prefix-icon="'Search'" />
        <el-select v-model="typeFilter" placeholder="记录类型" clearable style="width: 130px">
          <el-option v-for="t in RECORD_TYPES" :key="t" :label="t" :value="t" />
        </el-select>
        <div class="cp-flex-1"></div>
        <el-button v-if="isDesktop" type="primary" @click="openRecordDialog()">
          <el-icon><Plus /></el-icon>新增记录
        </el-button>
        <el-button v-if="isMobile" type="primary" size="small" @click="openRecordDialog()">
          <el-icon><Plus /></el-icon>新增
        </el-button>
        <el-dropdown trigger="click">
          <el-button><el-icon><MoreFilled /></el-icon></el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item @click="openTemplateSave">保存为 DNS 模板</el-dropdown-item>
              <el-dropdown-item v-for="tpl in templates" :key="tpl.id" @click="applyTemplate(tpl)">
                套用模板：{{ tpl.name }}
              </el-dropdown-item>
              <el-dropdown-item v-if="!templates.length" disabled>暂无模板</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>

      <!-- 批量操作栏 -->
      <div v-if="selectedRecords.length" class="batchbar">
        <span>已选 <b class="cp-text-primary-color">{{ selectedRecords.length }}</b> 条记录</span>
        <el-button size="small" type="primary" plain @click="batchSetProxy(true)">开启代理</el-button>
        <el-button size="small" @click="batchSetProxy(false)">关闭代理</el-button>
        <el-button size="small" @click="batchSetTtl">TTL 设为自动</el-button>
        <el-button size="small" type="danger" plain @click="onBatchDelete">批量删除</el-button>
        <el-button size="small" text type="primary" @click="selectedRecords = []">取消</el-button>
      </div>

      <!-- 桌面表格 -->
      <template v-if="isDesktop">
        <el-alert v-if="resourceStore.dns.error" :title="resourceStore.dns.error" type="error" :closable="false" show-icon class="cp-alert-row" />
        <el-table :data="filteredRecords" v-loading="dnsLoading" row-key="id" class="record-table" @selection-change="(rows: CfDnsRecord[]) => (selectedRecords = rows)">
          <el-table-column type="selection" width="44" />
          <el-table-column label="名称" min-width="240">
            <template #default="{ row }">
              <el-tag size="small" :type="recordTypeTag(row.type)" effect="plain" class="type-tag">{{ row.type }}</el-tag>
              <span class="cp-mono">{{ row.name }}</span>
            </template>
          </el-table-column>
          <el-table-column label="内容 / 目标" min-width="220">
            <template #default="{ row }">
              <span class="cp-mono">{{ row.content }}</span>
              <span v-if="row.priority" class="cp-text-secondary cp-text-sm"> · 优先级 {{ row.priority }}</span>
            </template>
          </el-table-column>
          <el-table-column label="TTL" width="100">
            <template #default="{ row }">{{ formatTtl(row.ttl) }}</template>
          </el-table-column>
          <el-table-column label="代理" width="90">
            <template #default="{ row }">
              <el-switch
                :model-value="!!row.proxied"
                :disabled="!row.proxiable"
                size="small"
                @change="(v: string | number | boolean) => toggleProxy(row as CfDnsRecord, !!v)"
              />
            </template>
          </el-table-column>
          <el-table-column label="备注" min-width="140" show-overflow-tooltip>
            <template #default="{ row }">{{ row.comment ?? '-' }}</template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="openRecordDialog(row as CfDnsRecord)">编辑</el-button>
              <el-button size="small" text type="danger" @click="removeRecord(row as CfDnsRecord)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 移动端列表 -->
      <template v-else>
        <van-pull-refresh v-model="pulling" @refresh="reloadDns">
          <el-alert v-if="resourceStore.dns.error" :title="resourceStore.dns.error" type="error" :closable="false" show-icon />
          <el-empty v-if="!filteredRecords.length" description="暂无解析记录" />
          <div v-for="row in filteredRecords" :key="row.id" class="cp-list-card">
            <div class="cp-list-card__head">
              <span class="cp-list-card__title">
                <el-tag size="small" :type="recordTypeTag(row.type)" effect="plain" class="type-tag">{{ row.type }}</el-tag>
                <span class="cp-mono cp-text-sm">{{ row.name }}</span>
              </span>
              <el-switch
                :model-value="!!row.proxied"
                :disabled="!row.proxiable"
                size="small"
                @change="(v: string | number | boolean) => toggleProxy(row, !!v)"
              />
            </div>
            <div class="cp-list-card__row"><span>内容</span><span class="cp-mono cp-ellipsis">{{ row.content }}</span></div>
            <div class="cp-list-card__row"><span>TTL</span><span>{{ formatTtl(row.ttl) }}</span></div>
            <div class="cp-list-card__actions">
              <van-button size="mini" type="primary" plain @click="openRecordDialog(row as CfDnsRecord)">编辑</van-button>
              <van-button size="mini" type="danger" plain @click="removeRecord(row as CfDnsRecord)">删除</van-button>
            </div>
          </div>
        </van-pull-refresh>
      </template>
    </template>

    <!-- 添加域名 -->
    <el-dialog
      :model-value="zoneDialogVisible"
      title="添加域名"
      width="520px"
      :append-to-body="true"
      @close="zoneDialogVisible = false"
    >
      <el-form label-width="90px" label-position="left">
        <el-form-item label="所属账号">
          <el-select v-model="zoneForm.accountId" style="width: 100%">
            <el-option v-for="acc in zoneAccounts" :key="acc.id" :label="acc.name" :value="acc.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="域名">
          <el-input v-model="zoneForm.name" placeholder="例如 example.com" class="cp-mono" />
        </el-form-item>
        <el-form-item label="接入方式">
          <el-radio-group v-model="zoneForm.zoneType">
            <el-radio value="full">标准接入（NS 托管）</el-radio>
            <el-radio value="partial">部分接入（CNAME 设置）</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="zoneForm.zoneType === 'full'" label="自动解析">
          <el-switch v-model="zoneForm.jumpStart" />
          <span class="cp-text-sm cp-text-secondary" style="margin-left: 8px">自动创建常见解析记录</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="zoneDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingZone" :disabled="!zoneForm.name.trim()" @click="saveZone">添加</el-button>
      </template>
    </el-dialog>

    <!-- 新增 / 编辑解析记录 -->
    <el-dialog
      :model-value="recordDialogVisible"
      :title="editingRecord ? '编辑解析记录' : '新增解析记录'"
      width="500px"
      :append-to-body="true"
      @close="recordDialogVisible = false"
    >
      <el-form label-width="70px" label-position="left">
        <el-form-item label="类型">
          <el-select v-model="recordForm.type" style="width: 100%" :disabled="!!editingRecord">
            <el-option v-for="t in RECORD_TYPES" :key="t" :label="t" :value="t" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="recordForm.name" :placeholder="`例如 ${currentZone?.name ?? 'www.example.com'}`" />
        </el-form-item>
        <el-form-item :label="recordForm.type === 'TXT' ? '文本' : '内容 / 目标'">
          <el-input v-model="recordForm.content" :type="recordForm.type === 'TXT' ? 'textarea' : 'text'" :rows="2" placeholder="记录内容 / 目标地址" />
        </el-form-item>
        <el-form-item v-if="recordForm.type === 'MX' || recordForm.type === 'SRV'" label="优先级">
          <el-input-number v-model="recordForm.priority" :min="0" :max="65535" style="width: 100%" />
        </el-form-item>
        <el-form-item label="TTL">
          <el-select v-model="recordForm.ttl" style="width: 100%">
            <el-option label="自动" :value="1" />
            <el-option v-for="ttl in TTL_OPTIONS" :key="ttl" :label="`${ttl} 秒`" :value="ttl" />
          </el-select>
        </el-form-item>
        <el-form-item label="CDN 代理">
          <el-switch v-model="recordForm.proxied" />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="recordForm.comment" placeholder="可选备注（仅本记录）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="recordDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingRecord" @click="saveRecord">{{ editingRecord ? '保存' : '新增' }}</el-button>
      </template>
    </el-dialog>

    <!-- 保存模板 -->
    <el-dialog v-model="templateSaveVisible" title="保存为 DNS 模板" width="360px" :append-to-body="true">
      <el-input v-model="templateName" placeholder="模板名称，例如：基础站点模板" />
      <template #footer>
        <el-button @click="templateSaveVisible = false">取消</el-button>
        <el-button type="primary" @click="saveTemplate">保存</el-button>
      </template>
    </el-dialog>

    <!-- 证书 / 域名详情 -->
    <el-dialog v-model="certVisible" :title="`域名信息 · ${currentZone?.name ?? ''}`" width="520px" :append-to-body="true">
      <div v-if="certZone">
        <div class="detail-grid">
          <div class="detail-item"><span>域名</span><b>{{ certZone.name }}</b></div>
          <div class="detail-item"><span>状态</span><b>{{ zoneStatusLabel(certZone) }}</b></div>
          <div class="detail-item"><span>账号</span><b>{{ accountName(certZone.__accountId) }}</b></div>
          <div class="detail-item"><span>套餐</span><b>{{ certZone.plan?.name ?? '-' }}</b></div>
          <div class="detail-item"><span>创建时间</span><b>{{ formatTime(certZone.created_on, false) }}</b></div>
          <div class="detail-item"><span>激活时间</span><b>{{ formatTime(certZone.activated_on, false) }}</b></div>
        </div>
        <div class="cp-card__title" style="margin-top: 12px">
          <span>Nameservers</span>
        </div>
        <div v-if="certZone.name_servers?.length" class="cp-mono cp-text-sm detail-ns">
          {{ certZone.name_servers.join('\n') }}
        </div>
        <div class="cp-card__title" style="margin-top: 12px">
          <span>SSL 证书</span>
          <el-button size="small" text type="primary" @click="loadCertificates">刷新</el-button>
        </div>
        <div v-if="!credentials.length" class="cp-empty">暂无证书信息</div>
        <div v-for="cert in credentials" :key="cert.id" class="cert-row">
          <span class="cp-text-sm">{{ cert.type }}</span>
          <el-tag size="small" :type="cert.status === 'active' ? 'success' : 'warning'" effect="light">{{ cert.status }}</el-tag>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, MoreFilled, Plus } from '@element-plus/icons-vue'
import { usePlatform } from '@/utils/platform'
import { useAccountStore } from '@/store/useAccountStore'
import { useResourceStore } from '@/store/useResourceStore'
import { useLogStore } from '@/store/useLogStore'
import { buildRequestContext } from '@/store/credentialService'
import * as dnsApi from '@/api/dns'
import * as zonesApi from '@/api/zones'
import type { CertificatePack } from '@/api/zones'
import { formatTime, formatTtl } from '@/utils/format'
import { runWithConcurrency } from '@/utils/scheduler'
import { STORE, getAllRecords, putRecord } from '@/utils/db'
import { randomId } from '@/utils/crypto'
import type { CfDnsRecord, CfZone, CloudflareAccount, DnsRecordType, DnsTemplate } from '@/types'

const RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'SRV', 'CAA', 'NS'] as const
const TTL_OPTIONS = [60, 120, 300, 600, 900, 1800, 3600, 7200, 18000, 43200, 86400]

const route = useRoute()
const router = useRouter()
const { isDesktop, isMobile } = usePlatform()
const accountStore = useAccountStore()
const resourceStore = useResourceStore()
const logStore = useLogStore()

const zoneId = computed(() => (route.params.zoneId as string | undefined) ?? '')

/* ---------------- 域名列表 ---------------- */
const keyword = ref('')
const statusFilter = ref('')
const accountFilter = ref('')

const filteredZones = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return resourceStore.zones.rows.filter((zone) => {
    if (statusFilter.value && zone.status !== statusFilter.value) return false
    if (accountFilter.value && zone.__accountId !== accountFilter.value) return false
    if (kw && !zone.name.toLowerCase().includes(kw)) return false
    return true
  })
})

function accountName(accountId?: string): string {
  if (!accountId) return '-'
  return accountStore.resolveAccount(accountId)?.name ?? `未知账号(${accountId.slice(0, 6)})`
}

function zoneStatusLabel(zone: CfZone): string {
  if (zone.paused) return '已暂停'
  switch (zone.status) {
    case 'active':
      return '已激活'
    case 'pending':
      return '待激活'
    case 'moved':
      return '已移走'
    case 'deleted':
      return '已删除'
    default:
      return zone.status ?? '-'
  }
}

function zoneTagType(status: CfZone['status']): 'success' | 'warning' | 'info' | 'danger' {
  if (status === 'active') return 'success'
  if (status === 'pending' || status === 'initializing') return 'warning'
  return 'info'
}

function goDetail(zone: CfZone) {
  router.push(`/dns/${zone.id}`)
}

async function onRefreshZones() {
  await resourceStore.loadZones(true)
}

/* ---------------- 添加域名 ---------------- */
const zoneDialogVisible = ref(false)
const savingZone = ref(false)
const zoneForm = reactive({
  accountId: '',
  name: '',
  zoneType: 'full' as 'full' | 'partial',
  jumpStart: true
})

const zoneAccounts = computed(() => accountStore.accounts.filter((a) => a.cfAccountId))

function openZoneDialog() {
  zoneForm.accountId = zoneAccounts.value[0]?.id ?? ''
  zoneForm.name = ''
  zoneForm.zoneType = 'full'
  zoneForm.jumpStart = true
  zoneDialogVisible.value = true
}

async function saveZone() {
  const name = zoneForm.name.trim().toLowerCase()
  if (!name) {
    ElMessage.warning('请填写域名')
    return
  }
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name)) {
    ElMessage.warning('域名格式不正确，例如 example.com')
    return
  }
  const account = accountStore.accounts.find((a) => a.id === zoneForm.accountId)
  if (!account?.cfAccountId) {
    ElMessage.warning('请选择已拉取资源的账号')
    return
  }
  savingZone.value = true
  try {
    const ctx = await buildRequestContext(account)
    const zone = await zonesApi.createZone(ctx, {
      name,
      account: { id: account.cfAccountId },
      type: zoneForm.zoneType,
      jump_start: zoneForm.zoneType === 'full' ? zoneForm.jumpStart : false
    })
    zoneDialogVisible.value = false
    await resourceStore.loadZones(true)
    ElMessage.success(`已添加域名「${zone.name}」`)
    if (zone.name_servers?.length) {
      await ElMessageBox.alert(
        `请在域名注册商处将 NS 修改为：\n\n${zone.name_servers.join('\n')}`,
        '域名已添加，等待激活',
        { confirmButtonText: '知道了' }
      )
    }
    await logStore.write({
      module: 'dns',
      action: '添加域名',
      detail: `添加域名「${zone.name}」（${zoneForm.zoneType === 'partial' ? '部分接入' : '标准接入'}）`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    savingZone.value = false
  }
}

async function togglePause(zone: CfZone) {
  const account = accountStore.accounts.find((a) => a.id === zone.__accountId)
  if (!account) {
    ElMessage.warning('未找到所属账号')
    return
  }
  const action = zone.paused ? '恢复' : '暂停'
  await ElMessageBox.confirm(`确认${action}域名「${zone.name}」？`, action + '域名', {
    type: 'warning',
    confirmButtonText: action,
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await zonesApi.setZonePaused(ctx, zone.id, !zone.paused)
    await resourceStore.loadZones(true)
    ElMessage.success(`已${action}`)
    await logStore.write({
      module: 'dns',
      action: `${action}域名`,
      detail: `${action}域名「${zone.name}」`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

async function removeZone(zone: CfZone) {
  const account = accountStore.accounts.find((a) => a.id === zone.__accountId)
  if (!account) {
    ElMessage.warning('未找到所属账号')
    return
  }
  await ElMessageBox.confirm(
    `删除域名「${zone.name}」？Cloudflare 侧数据将被移除，此操作不可恢复。`,
    '删除域名',
    { type: 'error', confirmButtonText: '删除', cancelButtonText: '取消' }
  )
  try {
    const ctx = await buildRequestContext(account)
    await zonesApi.deleteZone(ctx, zone.id)
    resourceStore.zones.rows = resourceStore.zones.rows.filter((z) => z.id !== zone.id)
    ElMessage.success('已删除')
    await logStore.write({
      module: 'dns',
      action: '删除域名',
      detail: `删除域名「${zone.name}」`,
      level: 'warning',
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 证书详情 ---------------- */
const certVisible = ref(false)
const certZone = ref<CfZone | null>(null)
const credentials = ref<CertificatePack[]>([])

async function viewCert(zone: CfZone) {
  certZone.value = zone
  certVisible.value = true
  await loadCertificates()
}

async function loadCertificates() {
  const zone = certZone.value
  if (!zone) return
  const account = accountStore.accounts.find((a) => a.id === zone.__accountId)
  if (!account) return
  try {
    const ctx = await buildRequestContext(account)
    credentials.value = await zonesApi.listCertificatePacks(ctx, zone.id)
  } catch {
    credentials.value = []
  }
}

/* ---------------- DNS 记录 ---------------- */
const dnsLoading = computed(() => resourceStore.dns.loading)
const recordKeyword = ref('')
const typeFilter = ref('')
const selectedRecords = ref<CfDnsRecord[]>([])
const pulling = ref(false)

const currentZone = computed(() =>
  zoneId.value ? resourceStore.zones.rows.find((z) => z.id === zoneId.value) : null
)

const zoneRecords = computed(() =>
  zoneId.value ? resourceStore.dns.rows.filter((r) => r.zone_id === zoneId.value) : []
)

const filteredRecords = computed(() => {
  const kw = recordKeyword.value.trim().toLowerCase()
  return zoneRecords.value.filter((record) => {
    if (typeFilter.value && record.type !== typeFilter.value) return false
    if (kw && !(`${record.name} ${record.content} ${record.comment ?? ''}`.toLowerCase().includes(kw)))
      return false
    return true
  })
})

async function reloadDns(force = true) {
  if (!zoneId.value) return
  await resourceStore.loadDns([zoneId.value], force)
  pulling.value = false
}

/* ---------------- 记录 CRUD ---------------- */
const recordDialogVisible = ref(false)
const editingRecord = ref<CfDnsRecord | null>(null)
const savingRecord = ref(false)
const recordForm = reactive({
  type: 'A' as string,
  name: '',
  content: '',
  ttl: 1,
  proxied: false,
  priority: undefined as number | undefined,
  comment: ''
})

function openRecordDialog(record?: CfDnsRecord) {
  editingRecord.value = record ?? null
  recordForm.type = record?.type ?? 'A'
  recordForm.name = record?.name ?? ''
  recordForm.content = record?.content ?? ''
  recordForm.ttl = record?.ttl ?? 1
  recordForm.proxied = record?.proxied ?? false
  recordForm.comment = record?.comment ?? ''
  recordForm.priority = record?.priority ?? undefined
  recordDialogVisible.value = true
}

/** 获取当前 zone 的所属账号与 API 上下文 */
async function currentContext(): Promise<CloudflareAccount | null> {
  const zone = currentZone.value
  const account = zone
    ? accountStore.resolveAccount(zone.__accountId) ?? accountStore.resolveAccount(zone.account?.id)
    : undefined
  if (!account) return null
  return account
}

async function saveRecord() {
  if (!recordForm.name.trim()) {
    ElMessage.warning('请填写记录名称')
    return
  }
  if (!recordForm.content.trim()) {
    ElMessage.warning('请填写记录内容')
    return
  }
  const account = await currentContext()
  if (!account || !zoneId.value) {
    ElMessage.warning('未找到所属账号，请先刷新域名列表')
    return
  }
  savingRecord.value = true
  try {
    const ctx = await buildRequestContext(account)
    const base = {
      type: recordForm.type,
      name: recordForm.name,
      content: recordForm.content,
      ttl: recordForm.ttl,
      proxied: recordForm.proxied,
      comment: recordForm.comment
    }
    if (recordForm.type === 'MX' || recordForm.type === 'SRV') {
      Object.assign(base, { priority: recordForm.priority ?? null })
    }
    if (editingRecord.value) {
      await dnsApi.updateDnsRecord(ctx, zoneId.value, editingRecord.value.id, base)
      await logStore.write({
        module: 'dns',
        action: '修改解析记录',
        detail: `更新 ${recordForm.type} ${recordForm.name} -> ${recordForm.content}`,
        accountId: account.id,
        accountName: account.name
      })
    } else {
      await dnsApi.createDnsRecord(ctx, zoneId.value, base)
      await logStore.write({
        module: 'dns',
        action: '新增解析记录',
        detail: `新增 ${recordForm.type} ${recordForm.name} -> ${recordForm.content}`,
        accountId: account.id,
        accountName: account.name
      })
    }
    ElMessage.success(editingRecord.value ? '已更新' : '已新增')
    recordDialogVisible.value = false
    await reloadDns()
  } catch (error) {
    ElMessage.error((error as Error).message)
    await logStore.write({
      module: 'dns',
      action: '解析记录操作失败',
      detail: (error as Error).message,
      level: 'error',
      result: 'fail',
      accountId: account.id,
      accountName: account.name
    })
  } finally {
    savingRecord.value = false
  }
}

async function toggleProxy(record: CfDnsRecord, proxied: boolean) {
  const account = record.__accountId
    ? accountStore.accounts.find((a) => a.id === record.__accountId)
    : undefined
  if (!account) return
  try {
    const ctx = await buildRequestContext(account)
    await dnsApi.updateDnsRecord(ctx, record.zone_id, record.id, { proxied })
    await reloadDns()
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

async function removeRecord(record: CfDnsRecord) {
  const account = record.__accountId
    ? accountStore.accounts.find((a) => a.id === record.__accountId)
    : undefined
  if (!account) {
    ElMessage.warning('未找到所属账号')
    return
  }
  await ElMessageBox.confirm(`删除解析记录 ${record.type} ${record.name}？`, '删除记录', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await dnsApi.deleteDnsRecord(ctx, record.zone_id, record.id)
    selectedRecords.value = selectedRecords.value.filter((r) => r.id !== record.id)
    await reloadDns()
    ElMessage.success('已删除')
    await logStore.write({
      module: 'dns',
      action: '删除解析记录',
      detail: `删除 ${record.type} ${record.name}`,
      level: 'warning',
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 批量操作 ---------------- */
async function batchSetProxy(proxied: boolean) {
  const account = await currentContext()
  const records = [...selectedRecords.value].filter((r) => r.proxiable)
  if (!account || !records.length) return
  try {
    const ctx = await buildRequestContext(account)
    await runWithConcurrency(records, 2, (record) =>
      dnsApi.updateDnsRecord(ctx, record.zone_id, record.id, { proxied })
    )
    await reloadDns()
    selectedRecords.value = []
    ElMessage.success(`已${proxied ? '开启' : '关闭'} ${records.length} 条记录代理`)
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

async function batchSetTtl() {
  const account = await currentContext()
  const records = [...selectedRecords.value]
  if (!account || !records.length) return
  try {
    const ctx = await buildRequestContext(account)
    await runWithConcurrency(records, 2, (record) =>
      dnsApi.updateDnsRecord(ctx, record.zone_id, record.id, { ttl: 1 })
    )
    await reloadDns()
    selectedRecords.value = []
    ElMessage.success(`已将 ${records.length} 条记录 TTL 设为自动`)
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

async function onBatchDelete() {
  const account = await currentContext()
  const records = [...selectedRecords.value]
  if (!account || !records.length) return
  await ElMessageBox.confirm(`确认删除所选 ${records.length} 条解析记录？`, '批量删除', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await runWithConcurrency(records, 3, (record) =>
      dnsApi.deleteDnsRecord(ctx, record.zone_id, record.id)
    )
    selectedRecords.value = []
    await reloadDns()
    ElMessage.success(`已删除 ${records.length} 条记录`)
    await logStore.write({
      module: 'dns',
      action: '批量删除解析记录',
      detail: `在「${currentZone.value?.name}」批量删除 ${records.length} 条记录`,
      level: 'warning',
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- DNS 模板 ---------------- */
const templates = ref<DnsTemplate[]>([])
const templateSaveVisible = ref(false)
const templateName = ref('')

async function loadTemplates() {
  templates.value = await getAllRecords<DnsTemplate>(STORE.template)
}

function openTemplateSave() {
  templateName.value = ''
  templateSaveVisible.value = true
}

async function saveTemplate() {
  const name = templateName.value.trim()
  if (!name) {
    ElMessage.warning('请输入模板名称')
    return
  }
  if (!zoneRecords.value.length) {
    ElMessage.warning('当前域名暂无解析记录可保存')
    return
  }
  const template: DnsTemplate = {
    id: randomId('tpl'),
    name,
    records: zoneRecords.value.map((r) => ({
      type: r.type as DnsRecordType,
      name: r.name,
      content: r.content,
      ttl: r.ttl,
      proxied: r.proxied,
      priority: r.priority ?? undefined,
      comment: r.comment ?? undefined
    })),
    createdAt: Date.now()
  }
  await putRecord(STORE.template, template)
  await loadTemplates()
  templateSaveVisible.value = false
  ElMessage.success('模板已保存')
}

async function applyTemplate(template: DnsTemplate) {
  const account = await currentContext()
  if (!account || !zoneId.value) {
    ElMessage.warning('未找到所属账号')
    return
  }
  await ElMessageBox.confirm(
    `将模板「${template.name}」的 ${template.records.length} 条记录套用到当前域名？`,
    '套用模板',
    { type: 'info', confirmButtonText: '套用', cancelButtonText: '取消' }
  )
  try {
    const ctx = await buildRequestContext(account)
    await dnsApi.createDnsRecords(ctx, zoneId.value, template.records)
    await reloadDns()
    ElMessage.success('模板已套用')
    await logStore.write({
      module: 'dns',
      action: '套用 DNS 模板',
      detail: `将模板「${template.name}」套用到「${currentZone.value?.name}」`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 工具 ---------------- */
function backToList() {
  router.push('/dns')
}

function recordTypeTag(type: string): 'primary' | 'success' | 'warning' | 'info' {
  const map: Record<string, 'primary' | 'success' | 'warning' | 'info'> = {
    A: 'primary',
    AAAA: 'primary',
    CNAME: 'success',
    MX: 'warning',
    TXT: 'info',
    SRV: 'warning',
    CAA: 'info',
    NS: 'info'
  }
  return map[type] ?? 'info'
}

onMounted(async () => {
  await accountStore.load()
  await loadTemplates()
  if (!resourceStore.zones.loaded) {
    await resourceStore.loadZones()
  }
  if (zoneId.value) {
    await reloadDns()
  }
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.zone-search {
  width: 260px;

  @include mobile {
    width: 100%;
  }
}

.zone-table,
.record-table {
  @include card;
}

.zone-name {
  color: var(--cp-primary);
  font-size: 13.5px;
}

.dns-head {
  display: flex;
  align-items: center;
  gap: 10px;

  &__info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }
}

.record-search {
  width: 220px;

  @include mobile {
    width: 100%;
  }
}

.batchbar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 8px 12px;
  border-radius: $radius-sm;
  background: var(--cp-primary-bg);
  border: 1px solid var(--cp-primary-border);
  font-size: 13px;
}

.type-tag {
  margin-right: 8px;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;

  @include mobile {
    grid-template-columns: 1fr;
  }
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: $radius-sm;
  background: var(--cp-bg-sunken);
  font-size: 12.5px;

  span {
    color: var(--cp-text-secondary);
  }
}

.detail-ns {
  padding: 10px 12px;
  border-radius: $radius-sm;
  background: var(--cp-bg-sunken);
  white-space: pre-wrap;
}

.cert-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px dashed var(--cp-border-light);

  &:last-child {
    border-bottom: none;
  }
}
</style>
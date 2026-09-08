<template>
  <div class="cp-page account-page">
    <!-- 移动端：分组快捷选择 -->
    <div v-if="isMobile" class="group-scroll">
      <span
        class="group-chip group-chip--add"
        @click="openGroupDialog()"
      >
        <el-icon :size="13"><Plus /></el-icon>&nbsp;新建分组
      </span>
      <span
        v-for="g in allGroups"
        :key="g.id"
        class="group-chip"
        :class="{ 'is-active': activeGroupId === g.id }"
        @click="activeGroupId = g.id"
      >{{ g.name }} ({{ groupCount(g.id) }})</span>
    </div>

    <div class="account-layout">
      <!-- 桌面侧栏：分组 -->
      <aside v-if="isDesktop" class="group-panel">
        <div class="group-panel__head">
          <span class="cp-text-bold">账号分组</span>
          <el-button type="primary" link size="small" @click="openGroupDialog()">
            <el-icon><Plus /></el-icon>&nbsp;新建
          </el-button>
        </div>
        <div class="group-panel__list">
          <div
            class="group-item"
            :class="{ 'is-active': activeGroupId === 'all' }"
            @click="activeGroupId = 'all'"
          >
            <span>全部账号</span>
            <span class="group-item__count">{{ accountStore.accounts.length }}</span>
          </div>
          <div v-for="g in sortedGroups" :key="g.id" class="group-item" :class="{ 'is-active': activeGroupId === g.id }">
            <span class="group-item__name" @click="activeGroupId = g.id">
              <el-icon :size="13" class="cp-text-secondary"><Folder /></el-icon>
              <span class="cp-ellipsis">{{ g.name }}</span>
              <span class="group-item__count">{{ groupCount(g.id) }}</span>
            </span>
            <span v-if="g.id !== 'ungrouped'" class="group-item__ops" @click.stop>
              <el-icon :size="13" @click="openGroupDialog(g)"><EditPen /></el-icon>
              <el-icon :size="13" class="cp-text-danger" @click="removeGroup(g)"><Delete /></el-icon>
            </span>
          </div>
        </div>
      </aside>

      <!-- 主内容 -->
      <div class="cp-flex-1 account-main">
        <!-- 工具条 -->
        <div class="cp-toolbar">
          <el-input
            v-model="keyword"
            :placeholder="isMobile ? '搜索账号' : '搜索账号名称 / 邮箱 / 备注'"
            clearable
            class="account-search"
            :prefix-icon="'Search'"
          />
          <el-select v-model="statusFilter" placeholder="状态" clearable style="width: 130px">
            <el-option label="正常" value="active" />
            <el-option label="失效" value="invalid" />
            <el-option label="权限不足" value="forbidden" />
            <el-option label="已过期" value="expired" />
            <el-option label="未检测" value="unknown" />
          </el-select>

          <div class="cp-flex-1"></div>

          <el-button type="primary" @click="openAddDialog">
            <el-icon><Plus /></el-icon>{{ isMobile ? '添加' : '添加账号' }}
          </el-button>
          <el-button v-if="isDesktop" :loading="accountStore.loading" @click="accountStore.checkAll()">批量检测</el-button>
          <el-button v-if="isDesktop" :loading="accountStore.loading" @click="onRefreshAll">一键刷新</el-button>
          <el-popconfirm v-if="isDesktop" title="将删除全部失效/异常账号，确认？" @confirm="onRemoveInvalid">
            <template #reference>
              <el-button type="danger" plain>清理异常</el-button>
            </template>
          </el-popconfirm>
          <el-dropdown v-if="isDesktop" trigger="click">
            <el-button><el-icon><MoreFilled /></el-icon></el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item @click="exportBackup">导出备份（含密钥）</el-dropdown-item>
                <el-dropdown-item @click="exportBackup(false)">导出备份（不含密钥）</el-dropdown-item>
                <el-dropdown-item @click="openImport">导入备份还原</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>

        <!-- 批量操作栏（勾选后显示） -->
        <div v-if="selectedRows.length" class="batchbar">
          <span>已选 <b class="cp-text-primary-color">{{ selectedRows.length }}</b> 个账号</span>
          <el-button size="small" @click="openMoveGroup">移至分组</el-button>
          <el-button size="small" type="danger" plain @click="onBatchRemove">批量删除</el-button>
          <el-button size="small" text type="primary" @click="selectedRows = []">取消选择</el-button>
        </div>

        <!-- 桌面表格 -->
        <template v-if="isDesktop">
          <el-table
            :data="filteredAccounts"
            row-key="id"
            v-loading="loadingRows"
            class="account-table"
            @selection-change="(rows: CloudflareAccount[]) => (selectedRows = rows)"
          >
            <el-table-column type="selection" width="44" />
            <el-table-column label="账号" min-width="180">
              <template #default="{ row }">
                <div class="acc-name">
                  <span class="cp-dot" :class="dotClass(row.status)"></span>
                  <span class="cp-ellipsis cp-text-bold">{{ row.name }}</span>
                </div>
                <div class="acc-identity cp-text-sm cp-text-secondary">{{ row.identity || row.id }}</div>
              </template>
            </el-table-column>
            <el-table-column label="鉴权" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="row.authType === 'token' ? 'primary' : 'warning'" effect="plain">
                  {{ row.authType === 'token' ? 'API Token' : 'Global Key' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="statusTagType(row.status)" effect="light" class="cp-ellipsis" :title="row.statusMessage">
                  {{ statusLabel(row.status) }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="资源" width="170">
              <template #default="{ row }">
                <span class="cp-text-sm cp-text-secondary">
                  域名 {{ row.stats?.zoneCount ?? 0 }} · Worker {{ row.stats?.workerCount ?? 0 }} · Pages {{ row.stats?.pagesCount ?? 0 }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="最近检测" width="120">
              <template #default="{ row }">{{ formatRelative(row.lastCheckedAt) }}</template>
            </el-table-column>
            <el-table-column label="操作" width="210" fixed="right">
              <template #default="{ row }">
                <el-button size="small" text type="primary" :loading="accountStore.checking[row.id]" @click="recheck(row as CloudflareAccount)">检测</el-button>
                <el-button size="small" text type="primary" :loading="accountStore.refreshing[row.id]" @click="refreshAccount(row as CloudflareAccount)">拉取资源</el-button>
                <el-button size="small" text type="primary" @click="openEditDialog(row as CloudflareAccount)">编辑</el-button>
                <el-button size="small" text type="danger" @click="removeAccount(row as CloudflareAccount)">删除</el-button>
              </template>
            </el-table-column>
          </el-table>
        </template>

        <!-- 移动端列表 -->
        <template v-else>
          <van-pull-refresh v-model="refreshing" @refresh="onRefreshAll">
            <van-empty v-if="!filteredAccounts.length" description="暂无账号" />
            <div v-for="row in filteredAccounts" :key="row.id" class="cp-list-card">
              <div class="cp-list-card__head">
                <span class="cp-list-card__title">{{ row.name }}</span>
                <el-tag size="small" :type="statusTagType(row.status)" effect="light">{{ statusLabel(row.status) }}</el-tag>
              </div>
              <div class="cp-list-card__row"><span>身份</span><span class="cp-ellipsis">{{ row.identity }}</span></div>
              <div class="cp-list-card__row">
                <span>资源</span><span>域名 {{ row.stats?.zoneCount ?? 0 }} · Worker {{ row.stats?.workerCount ?? 0 }} · Pages {{ row.stats?.pagesCount ?? 0 }}</span>
              </div>
              <div class="cp-list-card__row"><span>最近检测</span><span>{{ formatRelative(row.lastCheckedAt) }}</span></div>
              <div class="cp-list-card__actions">
                <van-button size="mini" type="primary" plain @click="recheck(row)">检测</van-button>
                <van-button size="mini" type="primary" @click="refreshAccount(row)">拉取资源</van-button>
                <van-button size="mini" type="default" @click="openEditDialog(row)">编辑</van-button>
                <van-button size="mini" type="danger" plain @click="removeAccount(row)">删除</van-button>
              </div>
            </div>
          </van-pull-refresh>
        </template>
      </div>
    </div>

    <!-- 新增 / 编辑账号 -->
    <el-dialog
      :model-value="dialogVisible"
      :title="editId ? '编辑账号' : '添加 Cloudflare 账号'"
      width="480px"
      :append-to-body="true"
      @close="closeDialog"
    >
      <el-form label-width="92px" label-position="left">
        <el-form-item label="账号名称">
          <el-input v-model="form.name" placeholder="例如：主账号 / 客户 A" />
        </el-form-item>
        <el-form-item label="鉴权方式">
          <el-radio-group v-model="form.authType" :disabled="!!editId">
            <el-radio value="token">API Token</el-radio>
            <el-radio value="globalKey">邮箱 + Global Key</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="form.authType === 'token'">
          <el-form-item label="API Token">
            <el-input v-model="form.token" type="password" show-password placeholder="粘贴 Cloudflare API Token" />
          </el-form-item>
        </template>
        <template v-else>
          <el-form-item label="邮箱">
            <el-input v-model="form.email" placeholder="Cloudflare 登录邮箱" />
          </el-form-item>
          <el-form-item label="Global Key">
            <el-input v-model="form.globalKey" type="password" show-password placeholder="Global API Key" />
          </el-form-item>
        </template>
        <el-form-item v-if="!editId" label="所属分组">
          <el-select v-model="form.groupId" style="width: 100%">
            <el-option v-for="g in sortedGroups" :key="g.id" :label="g.name" :value="g.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" placeholder="备注信息（仅保存在本地）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="cp-row cp-row--between">
          <el-button v-if="!editId" :loading="testing" @click="testCredentialNow">测试连通性</el-button>
          <div class="cp-row cp-row--end">
            <el-button @click="closeDialog">取消</el-button>
            <el-button type="primary" :loading="saving" @click="saveDialog">{{ editId ? '保存' : '添加账号' }}</el-button>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 分组编辑 -->
    <el-dialog :model-value="groupVisible" :title="groupEditId ? '重命名分组' : '新建分组'" width="360px" :append-to-body="true" @close="groupVisible = false">
      <el-input v-model="groupName" placeholder="分组名称" @keyup.enter="saveGroup" />
      <template #footer>
        <el-button @click="groupVisible = false">取消</el-button>
        <el-button type="primary" @click="saveGroup">确定</el-button>
      </template>
    </el-dialog>

    <!-- 移至分组 -->
    <el-dialog :model-value="moveVisible" title="移至分组" width="360px" :append-to-body="true" @close="moveVisible = false">
      <el-select v-model="moveTarget" style="width: 100%">
        <el-option v-for="g in sortedGroups" :key="g.id" :label="g.name" :value="g.id" />
      </el-select>
      <template #footer>
        <el-button @click="moveVisible = false">取消</el-button>
        <el-button type="primary" @click="doMoveGroup">确定</el-button>
      </template>
    </el-dialog>

    <!-- 导入备份 -->
    <input ref="importInput" type="file" accept=".json,application/json" style="display: none" @change="onImportFile" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { usePlatform } from '@/utils/platform'
import { useAccountStore } from '@/store/useAccountStore'
import { useLogStore } from '@/store/useLogStore'
import { createBackup, restoreBackup } from '@/utils/db'
import { downloadBlob } from '@/utils/format'
import { formatRelative } from '@/utils/format'
import type { AccountCreateInput, AccountGroup, AccountStatus, CloudflareAccount } from '@/types'

const { isDesktop, isMobile } = usePlatform()
const accountStore = useAccountStore()
const logStore = useLogStore()

const keyword = ref('')
const statusFilter = ref('')
const activeGroupId = ref('all')
const selectedRows = ref<CloudflareAccount[]>([])
const refreshing = ref(false)
const moving = ref(false)

const loadingRows = computed(() => accountStore.loading)

const sortedGroups = computed(() => accountStore.sortedGroups)
const allGroups = computed(() => [
  { id: 'all', name: '全部账号' },
  ...accountStore.sortedGroups
])

function groupCount(groupId: string): number {
  if (groupId === 'all') return accountStore.accounts.length
  return accountStore.accounts.filter((a) => a.groupId === groupId).length
}

const filteredAccounts = computed<CloudflareAccount[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return accountStore.accounts.filter((acc) => {
    if (activeGroupId.value !== 'all' && acc.groupId !== activeGroupId.value) return false
    if (statusFilter.value && acc.status !== statusFilter.value) return false
    if (kw) {
      const haystack = `${acc.name} ${acc.identity ?? ''} ${acc.remark ?? ''} ${acc.tags?.join(' ') ?? ''}`.toLowerCase()
      if (!haystack.includes(kw)) return false
    }
    return true
  })
})

function statusLabel(status: AccountStatus): string {
  const map: Record<AccountStatus, string> = {
    active: '正常',
    invalid: '失效',
    forbidden: '权限不足',
    expired: '已过期',
    unknown: '未检测'
  }
  return map[status] ?? status
}

function statusTagType(status: AccountStatus): 'success' | 'danger' | 'warning' | 'info' {
  switch (status) {
    case 'active':
      return 'success'
    case 'invalid':
      return 'danger'
    case 'forbidden':
    case 'expired':
      return 'warning'
    default:
      return 'info'
  }
}

function dotClass(status: AccountStatus): string {
  if (status === 'active') return 'is-online'
  if (status === 'forbidden' || status === 'expired') return 'is-warning'
  return 'is-error'
}

/* ---------------- 新增 / 编辑 ---------------- */

const dialogVisible = ref(false)
const editId = ref('')
const saving = ref(false)
const testing = ref(false)

const form = reactive<AccountCreateInput>({
  name: '',
  authType: 'token',
  token: '',
  email: '',
  globalKey: '',
  remark: '',
  tags: [],
  groupId: 'ungrouped',
  pinned: false
})

function openAddDialog() {
  editId.value = ''
  form.name = ''
  form.authType = 'token'
  form.token = ''
  form.email = ''
  form.globalKey = ''
  form.remark = ''
  form.groupId = 'ungrouped'
  dialogVisible.value = true
}

function openEditDialog(account: CloudflareAccount) {
  editId.value = account.id
  form.name = account.name
  form.authType = account.authType
  form.token = ''
  form.email = ''
  form.globalKey = ''
  form.remark = account.remark ?? ''
  form.groupId = account.groupId
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
}

async function testCredentialNow() {
  testing.value = true
  try {
    const result = await accountStore.testCredential({
      authType: form.authType,
      token: form.token,
      email: form.email,
      globalKey: form.globalKey
    })
    if (result.ok) {
      ElMessage.success(`连通正常，检测到账号 ID: ${result.cfAccountId ?? '未知'}`)
    } else {
      ElMessage.error(`鉴权失败：${result.statusMessage ?? '未知错误'}`)
    }
  } finally {
    testing.value = false
  }
}

async function saveDialog() {
  if (!form.name?.trim()) {
    ElMessage.warning('请填写账号名称')
    return
  }
  saving.value = true
  try {
    if (editId.value) {
      await accountStore.updateAccountMeta(editId.value, {
        name: form.name,
        remark: form.remark,
        tags: form.tags
      })
      ElMessage.success('已保存')
      dialogVisible.value = false
    } else {
      const result = await accountStore.addAccount({ ...form })
      if (result.ok) {
        ElMessage.success('添加成功，已开始拉取资源')
        dialogVisible.value = false
      } else {
        ElMessage.error(result.message ?? '添加失败')
      }
    }
  } finally {
    saving.value = false
  }
}

/* ---------------- 单账号操作 ---------------- */

async function recheck(account: CloudflareAccount) {
  const result = await accountStore.recheckAccount(account.id)
  if (result) {
    result.ok
      ? ElMessage.success(`「${account.name}」状态正常`)
      : ElMessage.warning(`「${account.name}」${result.statusMessage ?? '异常'}`)
  }
}

async function refreshAccount(account: CloudflareAccount) {
  const result = await accountStore.refreshAccount(account.id)
  if (result) {
    ElMessage.success(`「${account.name}」同步完成：域名 ${result.zones}、Worker ${result.workers}、Pages ${result.pages}`)
  }
}

async function onRefreshAll() {
  refreshing.value = true
  try {
    if (accountStore.accounts.length) await accountStore.refreshAll()
    else ElMessage.info('暂无账号')
  } finally {
    refreshing.value = false
  }
}

async function onRemoveInvalid() {
  const result = await accountStore.removeInvalidAccounts()
  ElMessage.success(`已清理 ${result.removed} 个异常账号`)
}

async function removeAccount(account: CloudflareAccount) {
  await ElMessageBox.confirm(
    `删除账号「${account.name}」及其本地缓存数据？此操作不可恢复。`,
    '删除账号',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  )
  await accountStore.removeAccount(account.id)
  selectedRows.value = selectedRows.value.filter((r) => r.id !== account.id)
  ElMessage.success('已删除')
}

async function onBatchRemove() {
  await ElMessageBox.confirm(
    `确认删除所选 ${selectedRows.value.length} 个账号？`,
    '批量删除',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  )
  if (moving.value) return
  for (const acc of [...selectedRows.value]) {
    await accountStore.removeAccount(acc.id)
  }
  selectedRows.value = []
  ElMessage.success('批量删除完成')
}

/* ---------------- 分组 ---------------- */

const groupVisible = ref(false)
const groupEditId = ref('')
const groupName = ref('')

function openGroupDialog(group?: AccountGroup) {
  groupEditId.value = group?.id ?? ''
  groupName.value = group?.name ?? ''
  groupVisible.value = true
}

async function saveGroup() {
  if (!groupName.value.trim()) {
    ElMessage.warning('请输入分组名称')
    return
  }
  if (groupEditId.value) await accountStore.renameGroup(groupEditId.value, groupName.value)
  else await accountStore.addGroup(groupName.value)
  groupVisible.value = false
}

async function removeGroup(group: AccountGroup) {
  await ElMessageBox.confirm(
    `删除分组「${group.name}」？组内账号将移入未分组。`,
    '删除分组',
    { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }
  )
  await accountStore.removeGroup(group.id)
  if (activeGroupId.value === group.id) activeGroupId.value = 'all'
}

/* ---------------- 批量移动 ---------------- */

const moveVisible = ref(false)
const moveTarget = ref('ungrouped')

function openMoveGroup() {
  moveTarget.value = 'ungrouped'
  moveVisible.value = true
}

async function doMoveGroup() {
  moving.value = true
  try {
    await accountStore.moveAccountToGroup(
      selectedRows.value.map((a) => a.id),
      moveTarget.value
    )
    ElMessage.success('已移动')
    moveVisible.value = false
    selectedRows.value = []
  } finally {
    moving.value = false
  }
}

/* ---------------- 备份导入导出 ---------------- */

async function exportBackup(includeCredentials = true) {
  try {
    const payload = await createBackup(includeCredentials)
    const text = JSON.stringify(payload, null, 2)
    const bridge = window.cloudpivot
    if (bridge?.fs?.saveFile) {
      const saved = await bridge.fs.saveFile({
        defaultPath: `cloudpivot-backup-${new Date().toISOString().slice(0, 10)}.json`,
        content: text,
        filters: [{ name: 'JSON', extensions: ['json'] }]
      })
      if (saved) ElMessage.success(`已导出：${saved}`)
    } else {
      downloadBlob(new Blob([text], { type: 'application/json' }), `cloudpivot-backup-${new Date().toISOString().slice(0, 10)}.json`)
      ElMessage.success('备份已导出')
    }
    await logStore.write({
      module: 'account',
      action: '导出备份',
      detail: `导出本地备份（${includeCredentials ? '包含密钥' : '不含密钥'}）`,
      level: 'info'
    })
  } catch (error) {
    ElMessage.error(`导出失败：${(error as Error).message}`)
  }
}

const importInput = ref<HTMLInputElement | null>(null)

function openImport() {
  importInput.value?.click()
}

async function onImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const payload = JSON.parse(text)
    const result = await restoreBackup(payload)
    // 重新加载账号与分组
    accountStore.loaded = false
    await accountStore.load()
    ElMessage.success(`还原成功：账号 ${result.accounts}、分组 ${result.groups}、模板 ${result.templates}`)
    await logStore.write({
      module: 'account',
      action: '导入还原',
      detail: `从备份文件还原 ${result.accounts} 个账号`,
      level: 'success'
    })
  } catch (error) {
    ElMessage.error(`导入失败：${(error as Error).message}`)
  }
}

onMounted(async () => {
  await accountStore.load()
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.account-layout {
  display: flex;
  align-items: flex-start;
  gap: 12px;

  @include mobile {
    flex-direction: column;
  }
}

.group-panel {
  width: 208px;
  flex: none;
  @include card;
  overflow: hidden;

  &__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    font-size: 13px;
    border-bottom: 1px solid var(--cp-border-light);
  }

  &__list {
    padding: 6px;
    max-height: 520px;
    overflow-y: auto;
  }
}

.group-item {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px 10px;
  border-radius: $radius-sm;
  font-size: 13px;
  cursor: pointer;
  color: var(--cp-text-regular);

  &:hover {
    background: var(--cp-bg-hover);
  }

  &.is-active {
    background: var(--cp-primary-bg);
    color: var(--cp-primary);
  }

  &__name {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  &__count {
    font-size: 11.5px;
    color: var(--cp-text-placeholder);
    padding: 0 6px;
  }

  &__ops {
    display: flex;
    gap: 4px;
    color: var(--cp-text-secondary);

    .el-icon:hover {
      color: var(--cp-primary);
    }
  }
}

.group-scroll {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.group-chip {
  flex: none;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--cp-bg-sunken);
  color: var(--cp-text-secondary);
  font-size: 12px;

  &.is-active {
    background: var(--cp-primary-bg);
    color: var(--cp-primary);
  }

  &--add {
    background: var(--cp-primary-bg);
    color: var(--cp-primary);
  }
}

.account-main {
  min-width: 0;
}

.account-search {
  width: 240px;

  @include mobile {
    width: 100%;
  }
}

.account-table {
  margin-top: 12px;

  @include card;
}

.acc-name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.acc-identity {
  margin-top: 2px;
  padding-left: 16px;
  @include ellipsis(1);
}

.batchbar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: $radius-sm;
  background: var(--cp-primary-bg);
  border: 1px solid var(--cp-primary-border);
  font-size: 13px;
}
</style>
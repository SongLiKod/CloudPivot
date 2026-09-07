<template>
  <div class="cp-page settings-page">
    <!-- 外观主题 -->
    <div class="settings-group">
      <div class="settings-group__title">
        <el-icon><Sunny /></el-icon>外观主题
        <span class="cp-text-sm cp-text-secondary">{{ themeStore.modeLabel }}</span>
      </div>
      <el-radio-group :model-value="themeStore.mode" @update:model-value="onThemeModeChange" class="theme-radio">
        <el-radio-button value="system">跟随系统</el-radio-button>
        <el-radio-button value="light">浅色模式</el-radio-button>
        <el-radio-button value="dark">深色模式</el-radio-button>
      </el-radio-group>
    </div>

    <!-- 通用 -->
    <div class="settings-group">
      <div class="settings-group__title">
        <el-icon><Setting /></el-icon>通用
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>自动同步资源</span>
          <span class="cp-text-sm cp-text-secondary">定期刷新各账号域名 / DNS / Worker / Pages 数据</span>
        </div>
        <el-switch
          :model-value="settingsStore.config.autoSyncEnabled"
          @change="(v: string | number | boolean) => settingsStore.update({ autoSyncEnabled: !!v })"
        />
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>同步周期</span>
          <span class="cp-text-sm cp-text-secondary">间隔太短可能触发 Cloudflare 限流</span>
        </div>
        <el-select
          :model-value="settingsStore.config.syncInterval"
          style="width: 140px"
          @update:model-value="settingsStore.updateSyncInterval($event as SyncIntervalMinutes)"
        >
          <el-option v-for="m in SYNC_INTERVAL_OPTIONS" :key="m" :label="`${m} 分钟`" :value="m" />
        </el-select>
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>日志保留天数</span>
          <span class="cp-text-sm cp-text-secondary">超过该天数的操作日志将被自动清理</span>
        </div>
        <el-input-number
          :model-value="settingsStore.config.logRetentionDays"
          :min="7"
          :max="3650"
          @update:model-value="settingsStore.update({ logRetentionDays: $event })"
        />
      </div>
    </div>

    <!-- 巡检 -->
    <div class="settings-group">
      <div class="settings-group__title">
        <el-icon><Monitor /></el-icon>健康巡检
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>启用定时巡检</span>
          <span class="cp-text-sm cp-text-secondary">定期检测账号异常、DNS 错误、配额超限等并生成告警</span>
        </div>
        <el-switch
          :model-value="settingsStore.config.inspectionEnabled"
          @change="(v: string | number | boolean) => settingsStore.update({ inspectionEnabled: !!v })"
        />
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>巡检间隔（分钟）</span>
          <span class="cp-text-sm cp-text-secondary">建议不小于 30 分钟</span>
        </div>
        <el-input-number
          :model-value="settingsStore.config.inspectionIntervalMinutes"
          :min="10"
          :max="1440"
          :step="10"
          @update:model-value="settingsStore.update({ inspectionIntervalMinutes: $event })"
        />
      </div>
    </div>

    <!-- 性能 -->
    <div class="settings-group">
      <div class="settings-group__title">
        <el-icon><Odometer /></el-icon>请求性能
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>最大并发数</span>
          <span class="cp-text-sm cp-text-secondary">批量操作与资源刷新的并发上限，过高易触发 429</span>
        </div>
        <el-input-number
          :model-value="settingsStore.config.concurrencyLimit"
          :min="1"
          :max="16"
          @update:model-value="settingsStore.update({ concurrencyLimit: $event })"
        />
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>请求超时（秒）</span>
          <span class="cp-text-sm cp-text-secondary">单次 API 请求超时时间</span>
        </div>
        <el-input-number
          :model-value="settingsStore.config.requestTimeout"
          :min="5"
          :max="120"
          @update:model-value="settingsStore.update({ requestTimeout: $event })"
        />
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>失败重试次数</span>
          <span class="cp-text-sm cp-text-secondary">指数退避重试，429 与网络错误时生效</span>
        </div>
        <el-input-number
          :model-value="settingsStore.config.retryTimes"
          :min="0"
          :max="5"
          @update:model-value="settingsStore.update({ retryTimes: $event })"
        />
      </div>
    </div>

    <!-- 备份 -->
    <div class="settings-group">
      <div class="settings-group__title">
        <el-icon><Files /></el-icon>数据备份 / 还原
        <span class="cp-text-sm cp-text-secondary">账号密钥使用 AES-256-GCM 加密存储</span>
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>导出备份</span>
          <span class="cp-text-sm cp-text-secondary">包含账号、分组、DNS 模板、配置与操作日志</span>
        </div>
        <div class="setting-row__action">
          <el-checkbox v-model="backupIncludeCredentials">包含密钥</el-checkbox>
          <el-button type="primary" :loading="backuping" @click="doBackup">导出</el-button>
        </div>
      </div>
      <div v-if="isDesktop" class="setting-row">
        <div class="setting-row__label">
          <span>默认备份目录</span>
          <span class="cp-text-sm cp-text-secondary">{{ settingsStore.config.backupPath || '未设置（默认下载目录）' }}</span>
        </div>
        <el-button @click="pickBackupPath">选择目录</el-button>
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>还原备份</span>
          <span class="cp-text-sm cp-text-secondary">不含密钥的备份仅能还原账号结构，凭据需重新填写</span>
        </div>
        <div class="setting-row__action">
          <el-checkbox v-model="restoreOverwriteLogs">覆盖日志</el-checkbox>
          <el-button :loading="restoring" @click="doRestore">选择文件还原</el-button>
        </div>
      </div>
    </div>

    <!-- 危险操作 -->
    <div class="settings-group settings-group--danger">
      <div class="settings-group__title">
        <el-icon><WarningFilled /></el-icon>危险操作
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>清空全部本地数据</span>
          <span class="cp-text-sm cp-text-secondary">删除所有账号、缓存、日志、模板与设置，且无法恢复</span>
        </div>
        <el-button type="danger" plain :loading="wiping" @click="doWipe">清空数据</el-button>
      </div>
    </div>

    <!-- 关于 -->
    <div class="settings-group">
      <div class="settings-group__title">
        <el-icon><InfoFilled /></el-icon>关于
      </div>
      <div class="about-grid">
        <div class="about-item"><span>应用</span><b>云枢 CloudPivot</b></div>
        <div class="about-item"><span>版本</span><b>v1.1.0</b></div>
        <div class="about-item"><span>运行环境</span><b>{{ runtimeLabel }}</b></div>
        <div class="about-item" v-if="isDesktop"><span>Electron</span><b class="cp-mono">{{ electronVersions?.electron ?? '未知' }}</b></div>
        <div class="about-item"><span>数据存储</span><b>IndexedDB（本机私有化）</b></div>
      </div>
    </div>

    <input ref="fileInput" type="file" accept=".json,application/json" style="display: none" @change="onRestoreFile" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Files, InfoFilled, Monitor, Odometer, Setting, Sunny, WarningFilled } from '@element-plus/icons-vue'
import { isElectron, usePlatform } from '@/utils/platform'
import { useThemeStore } from '@/store/useThemeStore'
import { useSettingsStore, SYNC_INTERVAL_OPTIONS } from '@/store/useSettingsStore'
import { useAccountStore } from '@/store/useAccountStore'
import { useLogStore } from '@/store/useLogStore'
import { createBackup, restoreBackup, wipeAllData } from '@/utils/db'
import type { BackupPayload, SyncIntervalMinutes, ThemeMode } from '@/types'

const { isDesktop, isMobile } = usePlatform()
const themeStore = useThemeStore()
const settingsStore = useSettingsStore()
const accountStore = useAccountStore()
const logStore = useLogStore()

/* ---------------- 主题 ---------------- */
async function onThemeModeChange(mode: string | number | boolean | undefined) {
  const value = (mode ?? 'system') as ThemeMode
  await themeStore.setMode(value)
  await settingsStore.update({ themeMode: value })
}

/* ---------------- 备份 / 还原 ---------------- */
const backupIncludeCredentials = ref(true)
const restoreOverwriteLogs = ref(false)
const backuping = ref(false)
const restoring = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

async function doBackup() {
  backuping.value = true
  try {
    const payload = await createBackup(backupIncludeCredentials.value)
    const filename = `cloudpivot-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.json`
    const content = JSON.stringify(payload, null, 2)

    if (isElectron && window.cloudpivot) {
      const dir = settingsStore.config.backupPath || undefined
      const saved = await window.cloudpivot.fs.saveFile({
        defaultPath: dir ? `${dir}\\${filename}` : filename,
        content,
        filters: [{ name: 'JSON 备份', extensions: ['json'] }]
      })
      if (saved) {
        ElMessage.success(`备份已导出：${saved}`)
        await logStore.write({ module: 'system', action: '导出备份', detail: `导出备份${backupIncludeCredentials.value ? '（含密钥）' : '（不含密钥）'}` })
      }
    } else {
      const blob = new Blob([content], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      anchor.click()
      URL.revokeObjectURL(url)
      ElMessage.success('备份已导出')
    }
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    backuping.value = false
  }
}

async function doRestore() {
  if (isElectron && window.cloudpivot) {
    const file = await window.cloudpivot.fs.openFile({
      filters: [{ name: 'JSON 备份', extensions: ['json'] }]
    })
    if (!file) return
    await applyRestore(file.content)
  } else {
    fileInput.value?.click()
  }
}

async function onRestoreFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const content = await file.text()
  input.value = ''
  await applyRestore(content)
}

async function applyRestore(content: string) {
  restoring.value = true
  try {
    const payload = JSON.parse(content) as BackupPayload
    const result = await restoreBackup(payload, { overwriteLogs: restoreOverwriteLogs.value })
    await accountStore.load()
    await settingsStore.init()
    ElMessage.success(`还原成功：账号 ${result.accounts} / 分组 ${result.groups} / 模板 ${result.templates}`)
    await logStore.write({
      module: 'system',
      action: '还原备份',
      detail: `从备份还原：账号 ${result.accounts}，分组 ${result.groups}，模板 ${result.templates}`,
      level: 'warning'
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    restoring.value = false
  }
}

async function pickBackupPath() {
  if (!isElectron || !window.cloudpivot) return
  const path = await window.cloudpivot.fs.pickDirectory()
  if (path) {
    await settingsStore.update({ backupPath: path })
    ElMessage.success(`备份目录已设置为：${path}`)
  }
}

/* ---------------- 危险操作 ---------------- */
const wiping = ref(false)

async function doWipe() {
  await ElMessageBox.confirm(
    '此操作将删除本机全部数据（账号、缓存、日志、模板、设置），且无法恢复！请输入「清空」以确认。',
    '危险操作确认',
    {
      type: 'error',
      confirmButtonText: '清空全部数据',
      cancelButtonText: '取消',
      inputValidator: (value) => value === '清空' || '请输入「清空」确认',
      inputPlaceholder: '输入「清空」'
    }
  )
  wiping.value = true
  try {
    await wipeAllData()
    await accountStore.load()
    await settingsStore.init()
    await themeStore.setMode('system')
    ElMessage.warning('本机数据已全部清空')
    await logStore.write({ module: 'system', action: '清空数据', detail: '清空了全部本地数据', level: 'warning' })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    wiping.value = false
  }
}

/* ---------------- 关于 ---------------- */
const runtimeLabel = computed(() => {
  if (isElectron) return `Electron（${window.cloudpivot?.platform ?? 'desktop'}）`
  if (isMobile) return 'Android (Capacitor)'
  return 'Web 浏览器'
})

const electronVersions = ref<{ electron?: string; chrome?: string; node?: string } | null>(null)

onMounted(async () => {
  await settingsStore.init()
  if (isElectron && window.cloudpivot) {
    const info = await window.cloudpivot.system.getInfo().catch(() => null)
    electronVersions.value = (info?.versions as { electron?: string; chrome?: string; node?: string } | undefined) ?? null
  }
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.settings-page {
  max-width: 860px;
}

.settings-group {
  @include card;
  margin-bottom: 14px;
  padding: 16px 18px;

  &--danger {
    border-color: var(--cp-danger, #f56c6c);
  }

  &__title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    font-size: 14px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--cp-border-light);
  }
}

.theme-radio {
  :deep(.el-radio-button__inner) {
    min-width: 110px;
    justify-content: center;
  }
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 0;
  border-bottom: 1px dashed var(--cp-border-light);

  &:last-child {
    border-bottom: none;
  }

  @include mobile {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }

  &__label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 13.5px;
  }

  &__action {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-shrink: 0;
  }
}

.about-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;

  @include mobile {
    grid-template-columns: 1fr 1fr;
  }
}

.about-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 12px;
  border-radius: $radius-sm;
  background: var(--cp-bg-sunken);

  span {
    font-size: 12px;
    color: var(--cp-text-secondary);
  }

  b {
    font-size: 13px;
    word-break: break-all;
  }
}
</style>
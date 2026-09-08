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

    <!-- 安全与锁定 -->
    <div class="settings-group">
      <div class="settings-group__title">
        <el-icon><Lock /></el-icon>安全与锁定
        <span class="cp-text-sm cp-text-secondary">应用锁 · 口令加固 · 自动锁定</span>
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>启用应用锁</span>
          <span class="cp-text-sm cp-text-secondary">启动与回到前台时需输入口令</span>
        </div>
        <el-switch :model-value="lockState.enabled" @change="onToggleLock" />
      </div>
      <template v-if="lockState.enabled">
        <div class="setting-row">
          <div class="setting-row__label">
            <span>{{ lockState.pinSet ? '修改口令' : '设置口令' }}</span>
            <span class="cp-text-sm cp-text-secondary">口令至少 4 位，请务必牢记</span>
          </div>
          <el-button :loading="pinSaving" @click="openPinDialog">{{ lockState.pinSet ? '修改' : '设置' }}</el-button>
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>口令加固主密钥</span>
            <span class="cp-text-sm cp-text-secondary">锁定时用口令加密主密钥、无法解密数据；忘记口令将无法恢复，建议先备份</span>
          </div>
          <el-switch :model-value="lockState.hardenMasterKey" :loading="hardenSaving" @change="onToggleHarden" />
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>自动锁定（空闲）</span>
          </div>
          <el-select :model-value="lockState.autoLockIdleMinutes" style="width: 130px" @change="onIdleChange">
            <el-option label="关闭" :value="0" />
            <el-option label="1 分钟" :value="1" />
            <el-option label="5 分钟" :value="5" />
            <el-option label="15 分钟" :value="15" />
            <el-option label="30 分钟" :value="30" />
          </el-select>
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>后台 / 失焦自动锁定</span>
            <span class="cp-text-sm cp-text-secondary">切到后台或窗口失焦时立即锁定</span>
          </div>
          <el-switch
            :model-value="lockState.autoLockOnBackground && lockState.autoLockOnBlur"
            @change="onToggleBackground"
          />
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>失败次数限制</span>
          </div>
          <el-input-number :model-value="lockState.failLimit" :min="1" :max="10" @change="onFailLimitChange" />
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>冷却时间（秒）</span>
          </div>
          <el-input-number :model-value="lockState.cooldownSeconds" :min="5" :max="600" @change="onCooldownChange" />
        </div>
      </template>
    </div>

    <!-- 邮箱提醒（口令备份） -->
    <div class="settings-group">
      <div class="settings-group__title">
        <el-icon><Message /></el-icon>邮箱提醒（口令备份）
        <span class="cp-text-sm cp-text-secondary">设置口令时可发送提醒到指定邮箱</span>
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>启用邮件提醒</span>
          <span class="cp-text-sm cp-text-secondary">设置/修改口令时自动发送提醒邮件</span>
        </div>
        <el-switch :model-value="email.enabled" @change="onEmailEnabled" />
      </div>
      <template v-if="email.enabled">
        <div class="setting-row">
          <div class="setting-row__label">
            <span>收件邮箱</span>
            <span class="cp-text-sm cp-text-secondary">支持 QQ / Outlook / Gmail 等任意邮箱</span>
          </div>
          <el-input v-model="email.recipient" placeholder="例如 name@qq.com" style="width: 240px" />
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>EmailJS Service ID</span>
            <span class="cp-text-sm cp-text-secondary">emailjs.com 控制台创建 Service 得到</span>
          </div>
          <el-input v-model="email.serviceId" placeholder="service_xxxxxxxx" class="cp-mono" style="width: 240px" />
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>EmailJS Template ID</span>
            <span class="cp-text-sm cp-text-secondary">emailjs.com 控制台创建的模板</span>
          </div>
          <el-input v-model="email.templateId" placeholder="template_xxxxxxxx" class="cp-mono" style="width: 240px" />
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>模板变量名：收件人 / 主题 / 正文</span>
            <span class="cp-text-sm cp-text-secondary">需与模板中的变量保持一致（默认 to_email / subject / message）</span>
          </div>
          <div class="cp-row">
            <el-input v-model="email.paramTo" placeholder="to_email" class="cp-mono email-var" />
            <el-input v-model="email.paramSubject" placeholder="subject" class="cp-mono email-var" />
            <el-input v-model="email.paramMessage" placeholder="message" class="cp-mono email-var" />
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>EmailJS Public Key</span>
            <span class="cp-text-sm cp-text-secondary">公开密钥，非敏感</span>
          </div>
          <el-input v-model="email.publicKey" placeholder="xxxxxxxx" class="cp-mono" style="width: 240px" />
        </div>
        <div class="setting-row">
          <div class="setting-row__label">
            <span>操作</span>
          </div>
          <div class="setting-row__action">
            <el-button :loading="emailSaving" @click="saveEmail">保存</el-button>
            <el-button :loading="emailTesting" @click="testEmail">发送测试邮件</el-button>
          </div>
        </div>
      </template>
    </div>

    <!-- 危险操作 -->
    <div class="settings-group settings-group--danger">
      <div class="settings-group__title">
        <el-icon><WarningFilled /></el-icon>危险操作
      </div>
      <div class="setting-row">
        <div class="setting-row__label">
          <span>重置资源数据（保留账号）</span>
          <span class="cp-text-sm cp-text-secondary">清除缓存、日志、模板与巡检记录，保留账号与设置，便于重新同步资源</span>
        </div>
        <el-button type="warning" plain :loading="resetting" @click="doResetData">重置</el-button>
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
        <div class="about-item"><span>版本</span><b>v{{ appVersion }}</b></div>
        <div class="about-item"><span>运行环境</span><b>{{ runtimeLabel }}</b></div>
        <div class="about-item" v-if="isDesktop"><span>Electron</span><b class="cp-mono">{{ electronVersions?.electron ?? '未知' }}</b></div>
        <div class="about-item"><span>数据存储</span><b>IndexedDB（本机私有化）</b></div>
      </div>
      <div class="about-actions">
        <el-button type="primary" plain @click="showUpdateDialog = true">
          <el-icon><Download /></el-icon>检查更新
        </el-button>
      </div>
    </div>

    <!-- 更新对话框 -->
    <UpdateDialog v-model="showUpdateDialog" />

    <!-- 设置 / 修改口令 -->
    <el-dialog
      :model-value="pinDialogVisible"
      :title="lockState.pinSet ? '修改口令' : '设置口令'"
      width="420px"
      :append-to-body="true"
      @close="pinDialogVisible = false"
    >
      <el-form label-width="70px" label-position="left">
        <el-form-item v-if="lockState.pinSet" label="原口令">
          <el-input v-model="pinForm.old" type="password" show-password placeholder="输入当前口令" />
        </el-form-item>
        <el-form-item label="新口令">
          <el-input v-model="pinForm.next" type="password" show-password placeholder="至少 4 位" />
        </el-form-item>
        <el-form-item label="确认口令">
          <el-input v-model="pinForm.confirm" type="password" show-password placeholder="再次输入新口令" @keyup.enter="savePin" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="pinDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="pinSaving" @click="savePin">确定</el-button>
      </template>
    </el-dialog>

    <input ref="fileInput" type="file" accept=".json,application/json" style="display: none" @change="onRestoreFile" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Download, Files, InfoFilled, Lock, Message, Monitor, Odometer, Setting, Sunny, WarningFilled } from '@element-plus/icons-vue'
import { isElectron, usePlatform } from '@/utils/platform'
import UpdateDialog from '@/components/UpdateDialog.vue'
import { useThemeStore } from '@/store/useThemeStore'
import { useSettingsStore, SYNC_INTERVAL_OPTIONS } from '@/store/useSettingsStore'
import { useAccountStore } from '@/store/useAccountStore'
import { useLogStore } from '@/store/useLogStore'
import { createBackup, restoreBackup, clearAllExceptAccounts, wipeAllData } from '@/utils/db'
import { resetMasterKeySession } from '@/utils/crypto'
import { useResourceStore } from '@/store/useResourceStore'

const appVersion = __APP_VERSION__
const showUpdateDialog = ref(false)

import {
  lockState,
  enableLock,
  disableLock,
  changePin,
  setHardenMasterKey,
  updateLockRules,
  refreshAutoLockRules,
  confirmPin
} from '@/utils/lockService'
import {
  getEmailSettings,
  saveEmailSettings,
  sendEmail,
  sendPinReminder,
  type EmailSettings
} from '@/utils/emailService'
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
    // 导出含密钥备份属敏感操作：应用锁开启时需二次输入口令
    if (backupIncludeCredentials.value && lockState.pinSet) {
      let ok = false
      try {
        const { value } = await ElMessageBox.prompt('导出含密钥的备份需验证口令', '安全确认', {
          type: 'warning',
          confirmButtonText: '确认导出',
          cancelButtonText: '取消',
          inputType: 'password',
          inputPlaceholder: '输入当前口令'
        })
        ok = await confirmPin(String(value))
      } catch {
        return
      }
      if (!ok) {
        ElMessage.error('口令错误，已取消导出')
        return
      }
    }
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
    // 备份可能写入新的 __master_key__，重置会话主密钥使其与磁盘状态一致
    await resetMasterKeySession()
    accountStore.loaded = false
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

/* ---------------- 安全与锁定 ---------------- */
const pinDialogVisible = ref(false)
const pinSaving = ref(false)
const hardenSaving = ref(false)
const pinForm = reactive({ old: '', next: '', confirm: '' })

function openPinDialog() {
  pinForm.old = ''
  pinForm.next = ''
  pinForm.confirm = ''
  pinDialogVisible.value = true
}

async function onToggleLock(value: string | number | boolean) {
  const enable = !!value
  if (enable) {
    openPinDialog()
  } else {
    await ElMessageBox.prompt('请输入当前口令以关闭应用锁', '关闭应用锁', {
      type: 'warning',
      confirmButtonText: '关闭',
      cancelButtonText: '取消',
      inputType: 'password',
      inputPlaceholder: '输入当前口令'
    })
      .then(async ({ value: pin }) => {
        try {
          await disableLock(String(pin))
          ElMessage.success('应用锁已关闭')
          await logStore.write({ module: 'system', action: '关闭应用锁', detail: '关闭了应用锁', level: 'warning' })
        } catch (error) {
          ElMessage.error((error as Error).message)
        }
      })
      .catch(() => {
        /* 取消 */
      })
  }
}

async function savePin() {
  const next = pinForm.next.trim()
  if (next.length < 4) {
    ElMessage.warning('口令至少 4 位')
    return
  }
  if (next !== pinForm.confirm) {
    ElMessage.warning('两次输入的口令不一致')
    return
  }
  pinSaving.value = true
  try {
    if (lockState.pinSet) {
      await changePin(pinForm.old, next)
      ElMessage.success('口令已更新')
      await logStore.write({ module: 'system', action: '修改口令', detail: '修改了应用锁口令' })
    } else {
      await enableLock(next, false)
      ElMessage.success('应用锁已启用')
      await logStore.write({ module: 'system', action: '启用应用锁', detail: '启用了应用锁', level: 'warning' })
    }
    pinDialogVisible.value = false
    // 口令已设置，若开启邮件提醒则发送备份提醒
    if (email.value.enabled) {
      try {
        await sendPinReminder(next)
        ElMessage.success('口令提醒邮件已发送')
        await logStore.write({ module: 'system', action: '发送口令提醒邮件', detail: `已发送到 ${email.value.recipient}` })
      } catch (error) {
        ElMessage.warning(`口令已设置，但提醒邮件发送失败：${(error as Error).message}`)
      }
    }
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    pinSaving.value = false
  }
}

async function onToggleHarden(value: string | number | boolean) {
  const enable = !!value
  if (enable) {
    const confirmed = await ElMessageBox.confirm(
      '开启后，锁定时将以口令加密主密钥、无法解密任何数据；若忘记口令，本机加密数据将无法恢复（建议先导出备份）。确认开启？',
      '口令加固确认',
      { type: 'warning', confirmButtonText: '开启', cancelButtonText: '取消' }
    )
      .then(() => true)
      .catch(() => false)
    if (!confirmed) return
  }
  hardenSaving.value = true
  try {
    await setHardenMasterKey(enable)
    ElMessage.success(enable ? '已开启口令加固' : '已关闭口令加固')
    await logStore.write({
      module: 'system',
      action: enable ? '开启口令加固' : '关闭口令加固',
      detail: enable ? '开启了口令加固主密钥' : '关闭了口令加固主密钥',
      level: 'warning'
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    hardenSaving.value = false
  }
}

async function onIdleChange(value: string | number | boolean) {
  const minutes = Number(value) || 0
  await updateLockRules({ autoLockIdleMinutes: minutes })
  refreshAutoLockRules()
}

async function onToggleBackground(value: string | number | boolean) {
  const enable = !!value
  await updateLockRules({ autoLockOnBlur: enable, autoLockOnBackground: enable })
}

async function onFailLimitChange(value: number | undefined) {
  if (!value) return
  await updateLockRules({ failLimit: value })
}

async function onCooldownChange(value: number | undefined) {
  if (!value) return
  await updateLockRules({ cooldownSeconds: value })
}

/* ---------------- 邮箱提醒 ---------------- */
const email = ref<EmailSettings>({
  enabled: false,
  serviceId: '',
  templateId: '',
  recipient: '',
  publicKey: '',
  paramTo: 'to_email',
  paramSubject: 'subject',
  paramMessage: 'message'
})
const emailSaving = ref(false)
const emailTesting = ref(false)

async function loadEmailSettings() {
  email.value = await getEmailSettings()
}

async function onEmailEnabled(value: string | number | boolean) {
  email.value = await saveEmailSettings({ enabled: !!value })
}

async function saveEmail() {
  emailSaving.value = true
  try {
    email.value = await saveEmailSettings({
      recipient: email.value.recipient.trim(),
      serviceId: email.value.serviceId.trim(),
      templateId: email.value.templateId.trim(),
      publicKey: email.value.publicKey.trim(),
      paramTo: email.value.paramTo.trim() || 'to_email',
      paramSubject: email.value.paramSubject.trim() || 'subject',
      paramMessage: email.value.paramMessage.trim() || 'message'
    })
    ElMessage.success('邮件提醒配置已保存')
    await logStore.write({
      module: 'system',
      action: '保存邮箱提醒配置',
      detail: `收件邮箱：${email.value.recipient || '未设置'}`
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    emailSaving.value = false
  }
}

async function testEmail() {
  emailTesting.value = true
  try {
    await saveEmail()
    await sendEmail('云枢 CloudPivot 测试邮件', '这是一封来自云枢 CloudPivot 的测试邮件。')
    ElMessage.success('测试邮件已发送，请查收')
    await logStore.write({
      module: 'system',
      action: '发送测试邮件',
      detail: `已发送测试邮件到 ${email.value.recipient}`
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    emailTesting.value = false
  }
}

/* ---------------- 危险操作 ---------------- */
const wiping = ref(false)
const resetting = ref(false)

/** 清除除账号外的全部数据，便于重新同步资源 */
async function doResetData() {
  await ElMessageBox.confirm(
    '将清除除账号外的全部本地数据（资源缓存、操作日志、批量任务、DNS 模板、巡检记录），保留账号与设置，之后需重新同步资源。请输入「重置」以确认。',
    '重置数据确认',
    {
      type: 'warning',
      confirmButtonText: '重置数据',
      cancelButtonText: '取消',
      inputValidator: (value) => value === '重置' || '请输入「重置」确认',
      inputPlaceholder: '输入「重置」'
    }
  )
  resetting.value = true
  try {
    await clearAllExceptAccounts()
    useResourceStore().resetAll()
    await accountStore.load()
    ElMessage.success('已清除除账号外的本地数据，可在各页面重新同步')
    await logStore.write({
      module: 'system',
      action: '重置资源数据',
      detail: '清除了除账号外的本地数据（保留账号与设置）',
      level: 'warning'
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    resetting.value = false
  }
}

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
    await resetMasterKeySession()
    accountStore.$reset()
    settingsStore.$reset()
    useResourceStore().resetAll()
    await settingsStore.init()
    await themeStore.setMode('system')
    await accountStore.load()
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
  await loadEmailSettings()
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

.email-var {
  width: 120px;
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

.about-actions {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
</style>
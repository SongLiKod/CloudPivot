<template>
  <el-dialog
    v-model="visible"
    title="发现新版本"
    width="480px"
    :close-on-click-modal="!status.downloading"
    :close-on-press-escape="!status.downloading"
    :show-close="!status.downloading"
    @close="handleClose"
  >
    <div class="update-content">
      <!-- 检查中 -->
      <div v-if="status.checking" class="update-state">
        <el-icon class="is-loading" :size="32"><Loading /></el-icon>
        <p>正在检查更新...</p>
      </div>

      <!-- 有更新 -->
      <div v-else-if="status.available && !status.downloaded" class="update-state">
        <div class="update-header">
          <el-tag type="success" size="large">v{{ status.version }}</el-tag>
          <span class="current-version">当前版本: v{{ currentVersion }}</span>
        </div>
        <div class="release-notes">
          <h4>更新内容</h4>
          <div class="notes-content" v-html="releaseNotes"></div>
        </div>
        <div class="update-actions">
          <el-button @click="handleClose">稍后更新</el-button>
          <el-button type="primary" :loading="status.downloading" @click="handleDownload">
            {{ status.downloading ? `下载中 ${status.progress}%` : '立即更新' }}
          </el-button>
        </div>
      </div>

      <!-- 下载中 -->
      <div v-else-if="status.downloading" class="update-state">
        <el-progress :percentage="Math.round(status.progress)" :stroke-width="12" />
        <p class="download-tip">正在下载更新包，请稍候...</p>
      </div>

      <!-- 下载完成 -->
      <div v-else-if="status.downloaded" class="update-state">
        <el-icon :size="48" color="#22c55e"><CircleCheck /></el-icon>
        <p class="success-tip">更新包下载完成</p>
        <div class="update-actions">
          <el-button @click="handleClose">稍后安装</el-button>
          <el-button type="primary" @click="handleInstall">立即安装</el-button>
        </div>
      </div>

      <!-- 错误 -->
      <div v-else-if="status.error" class="update-state">
        <el-icon :size="48" color="#f56c6c"><CircleClose /></el-icon>
        <p class="error-tip">{{ status.error }}</p>
        <el-button @click="handleClose">关闭</el-button>
      </div>

      <!-- 已是最新 -->
      <div v-else class="update-state">
        <el-icon :size="48" color="#22c55e"><CircleCheck /></el-icon>
        <p>当前已是最新版本 v{{ currentVersion }}</p>
        <el-button @click="handleClose">确定</el-button>
      </div>
    </div>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { CircleCheck, CircleClose, Loading } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { isElectron } from '@/utils/platform'
import { checkForUpdate, downloadUpdate, installUpdate, type ReleaseInfo } from '@/utils/updateService'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const currentVersion = __APP_VERSION__
const releaseNotes = ref('')

const status = ref({
  checking: false,
  available: false,
  downloading: false,
  downloaded: false,
  error: null as string | null,
  version: null as string | null,
  progress: 0
})

let releaseInfo: ReleaseInfo | null = null

// 监听 Electron 更新状态
function setupElectronUpdateListener() {
  if (!isElectron || !window.cloudpivot?.update) return

  window.cloudpivot.update.onStatusChange((newStatus) => {
    status.value = { ...status.value, ...newStatus }
  })
}

// 格式化 Markdown 为 HTML（简单处理）
function formatReleaseNotes(notes: string): string {
  return notes
    .replace(/^### (.*$)/gm, '<h3>$1</h3>')
    .replace(/^## (.*$)/gm, '<h2>$1</h2>')
    .replace(/^# (.*$)/gm, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/^- (.*$)/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/^(?!<[hlu])(.*$)/gm, '<p>$1</p>')
}

async function startCheck() {
  status.value = {
    checking: true,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    version: null,
    progress: 0
  }

  const result = await checkForUpdate()

  if (result.error) {
    status.value = { ...status.value, checking: false, error: result.error }
    return
  }

  if (result.hasUpdate && result.release) {
    releaseInfo = result.release
    releaseNotes.value = formatReleaseNotes(result.release.releaseNotes || '无更新说明')
    status.value = {
      ...status.value,
      checking: false,
      available: true,
      version: result.release.version
    }
  } else {
    status.value = { ...status.value, checking: false, available: false }
  }
}

async function handleDownload() {
  if (isElectron && window.cloudpivot?.update) {
    // Electron: 使用 electron-updater
    await window.cloudpivot.update.download()
  } else if (releaseInfo) {
    // Android: 手动下载
    status.value = { ...status.value, downloading: true, progress: 0 }
    const result = await downloadUpdate(releaseInfo, (progress) => {
      status.value = { ...status.value, progress }
    })

    if (result.success && result.blob) {
      status.value = { ...status.value, downloading: false, downloaded: true }
      // 保存 blob 供安装使用
      ;(window as unknown as { _updateBlob?: Blob })._updateBlob = result.blob
    } else {
      status.value = { ...status.value, downloading: false, error: result.error || '下载失败' }
    }
  }
}

async function handleInstall() {
  if (isElectron && window.cloudpivot?.update) {
    // Electron: 静默安装并重启
    await window.cloudpivot.update.install()
  } else {
    // Android: 调用系统安装
    const blob = (window as unknown as { _updateBlob?: Blob })._updateBlob
    if (!blob) {
      ElMessage.error('未找到更新包')
      return
    }

    const result = await installUpdate(blob)
    if (!result.success) {
      ElMessage.error(result.error || '安装失败')
    }
  }
}

function handleClose() {
  visible.value = false
}

onMounted(() => {
  setupElectronUpdateListener()
  if (visible.value) {
    startCheck()
  }
})

watch(visible, (val) => {
  if (val) {
    startCheck()
  }
})

onUnmounted(() => {
  // 清理
})
</script>

<style scoped lang="scss">
.update-content {
  padding: 8px 0;
}

.update-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;

  p {
    margin: 0;
    color: var(--el-text-color-regular);
  }
}

.update-header {
  display: flex;
  align-items: center;
  gap: 12px;

  .current-version {
    color: var(--el-text-color-secondary);
    font-size: 13px;
  }
}

.release-notes {
  width: 100%;
  text-align: left;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 12px 16px;
  max-height: 200px;
  overflow-y: auto;

  h4 {
    margin: 0 0 8px 0;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .notes-content {
    font-size: 13px;
    line-height: 1.6;
    color: var(--el-text-color-regular);

    :deep(h1),
    :deep(h2),
    :deep(h3) {
      margin: 8px 0 4px 0;
      font-size: 14px;
    }

    :deep(p) {
      margin: 4px 0;
    }

    :deep(li) {
      margin-left: 16px;
    }

    :deep(code) {
      background: var(--el-fill-color);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
    }
  }
}

.update-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.download-tip,
.success-tip,
.error-tip {
  font-size: 14px;
}

.error-tip {
  color: var(--el-color-danger);
}

.success-tip {
  color: var(--el-color-success);
}
</style>

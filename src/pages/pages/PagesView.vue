<template>
  <div class="cp-page pages-page">
    <div class="cp-toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索项目"
        clearable
        class="project-search"
        :prefix-icon="'Search'"
      />
      <el-select v-model="accountFilter" placeholder="全部账号" clearable style="width: 170px">
        <el-option v-for="acc in accountStore.accounts" :key="acc.id" :label="acc.name" :value="acc.id" />
      </el-select>
      <div class="cp-flex-1"></div>
      <el-button type="primary" @click="openProjectDialog()">
        <el-icon><Plus /></el-icon>新建项目
      </el-button>
      <el-button :loading="resourceStore.pages.loading" @click="onRefresh">刷新</el-button>
    </div>

    <!-- 桌面表格 -->
    <template v-if="isDesktop">
      <el-table :data="filteredProjects" v-loading="resourceStore.pages.loading" class="project-table">
        <el-table-column label="项目名称" min-width="220">
          <template #default="{ row }">
            <span class="project-name cp-text-bold">{{ row.name }}</span>
            <div class="cp-text-sm cp-text-secondary">
              <span v-if="row.domains?.length" class="cp-mono">{{ row.domains[0] }}</span>
              <span v-else>{{ row.subdomain ?? '-' }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="账号" min-width="150">
          <template #default="{ row }">{{ accountName(row.__accountId) }}</template>
        </el-table-column>
        <el-table-column label="生产分支" width="120">
          <template #default="{ row }">{{ row.production_branch ?? '-' }}</template>
        </el-table-column>
        <el-table-column label="最新部署" min-width="200">
          <template #default="{ row }">
            <template v-if="row.latest_deployment">
              <el-tag size="small" effect="light" :type="stageTagType(row.latest_deployment.latest_stage?.status)">
                {{ stageLabel(row.latest_deployment.latest_stage?.status) }}
              </el-tag>
              <span class="cp-text-sm cp-text-secondary" style="margin-left: 8px">
                {{ formatTime(row.latest_deployment.created_on, false) }}
              </span>
            </template>
            <span v-else class="cp-text-secondary cp-text-sm">-</span>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button size="small" text type="primary" @click="openDetail(row as CfPagesProject)">部署管理</el-button>
            <el-button size="small" text @click="openProjectDialog(row as CfPagesProject)">编辑</el-button>
            <el-button size="small" text type="danger" @click="removeProject(row as CfPagesProject)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </template>

    <!-- 移动端列表 -->
    <template v-else>
      <el-empty v-if="!filteredProjects.length" description="暂无 Pages 项目" />
      <template v-for="row in filteredProjects" :key="row.name">
        <div class="cp-list-card" @click="openDetail(row as CfPagesProject)">
          <div class="cp-list-card__head">
            <span class="cp-list-card__title">{{ row.name }}</span>
            <el-tag v-if="row.latest_deployment" size="small" effect="light" :type="stageTagType(row.latest_deployment.latest_stage?.status)">
              {{ stageLabel(row.latest_deployment.latest_stage?.status) }}
            </el-tag>
          </div>
          <div class="cp-list-card__row"><span>账号</span><span>{{ accountName(row.__accountId) }}</span></div>
          <div class="cp-list-card__row"><span>域名</span><span class="cp-ellipsis">{{ row.domains?.length ? row.domains[0] : row.subdomain ?? '-' }}</span></div>
          <div class="cp-list-card__actions">
            <van-button size="mini" type="primary" plain @click.stop="openProjectDialog(row)">编辑</van-button>
            <van-button size="mini" type="danger" plain @click.stop="removeProject(row)">删除</van-button>
          </div>
        </div>
      </template>
    </template>

    <!-- 新建 / 编辑项目 -->
    <el-dialog
      :model-value="projectDialogVisible"
      :title="editingProject ? '编辑项目' : '新建 Pages 项目'"
      width="520px"
      :append-to-body="true"
      @close="projectDialogVisible = false"
    >
      <el-form label-width="90px" label-position="left">
        <el-form-item label="所属账号">
          <el-select v-model="projectForm.accountId" style="width: 100%" :disabled="!!editingProject">
            <el-option v-for="acc in accountStore.accounts" :key="acc.id" :label="acc.name" :value="acc.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="项目名称">
          <el-input v-model="projectForm.name" :disabled="!!editingProject" placeholder="小写字母、数字与连字符" />
        </el-form-item>
        <el-form-item v-if="!editingProject" label="代码来源">
          <el-radio-group v-model="projectForm.sourceType">
            <el-radio value="none">直接上传</el-radio>
            <el-radio value="github">GitHub</el-radio>
            <el-radio value="gitlab">GitLab</el-radio>
          </el-radio-group>
        </el-form-item>
        <template v-if="!editingProject && (projectForm.sourceType === 'github' || projectForm.sourceType === 'gitlab')">
          <el-form-item label="仓库所属者">
            <el-input v-model="projectForm.owner" placeholder="GitHub 用户/组织 或 GitLab 组/用户" />
          </el-form-item>
          <el-form-item label="仓库名">
            <el-input v-model="projectForm.repoName" placeholder="例如 my-site" />
          </el-form-item>
          <el-form-item>
            <span class="cp-text-sm cp-text-secondary">
              需先在 Cloudflare 控制台授权该 {{ projectForm.sourceType === 'github' ? 'GitHub' : 'GitLab' }} 账号
            </span>
          </el-form-item>
        </template>
        <el-form-item label="生产分支">
          <el-input v-model="projectForm.productionBranch" placeholder="main" />
        </el-form-item>
        <el-divider content-position="left">构建配置</el-divider>
        <el-form-item label="构建命令">
          <el-input v-model="projectForm.buildCommand" placeholder="如 npm run build" />
        </el-form-item>
        <el-form-item label="输出目录">
          <el-input v-model="projectForm.destDir" placeholder="如 dist" />
        </el-form-item>
        <el-form-item label="根目录">
          <el-input v-model="projectForm.rootDir" placeholder="默认空（仓库根目录）" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="projectDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingProject" :disabled="!projectForm.name.trim()" @click="saveProject">
          {{ editingProject ? '保存' : '创建' }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 部署管理 -->
    <el-dialog
      :model-value="detailVisible"
      :title="`部署管理 · ${detailProject?.name ?? ''}`"
      width="760px"
      :append-to-body="true"
      @close="detailVisible = false"
    >
      <template v-if="detailProject">
        <div class="detail-head">
          <div class="detail-head__item"><span>账号</span><b>{{ accountName(detailProject.__accountId) }}</b></div>
          <div class="detail-head__item"><span>域名</span><b>{{ detailProject.domains?.length ? detailProject.domains.join(', ') : detailProject.subdomain ?? '-' }}</b></div>
          <div class="detail-head__item"><span>生产分支</span><b>{{ detailProject.production_branch ?? '-' }}</b></div>
        </div>
        <div class="deploy-actions">
          <el-button type="primary" :loading="triggering" @click="triggerDeploy">触发构建</el-button>
          <el-button type="primary" plain :loading="uploading" @click="pickUploadFolder">
            <el-icon><Upload /></el-icon>上传部署
          </el-button>
          <el-button size="small" text @click="refreshDeployments">刷新</el-button>
        </div>
        <input
          ref="uploadInput"
          type="file"
          multiple
          webkitdirectory
          style="display: none"
          @change="onUploadFiles"
        />
        <div class="deploy-list" v-loading="deploymentsLoading">
          <el-empty v-if="!deploymentsLoading && !deployments.length" description="暂无部署" />
          <div v-for="dep in deployments" :key="dep.id" class="deploy-card">
            <div class="deploy-card__head">
              <el-tag size="small" effect="light" :type="stageTagType(dep.latest_stage?.status)">
                {{ stageLabel(dep.latest_stage?.status) }}
              </el-tag>
              <el-tag v-if="deploymentBranch(dep)" size="small" effect="plain" type="info" class="deploy-card__branch">
                <el-icon><Connection /></el-icon>{{ deploymentBranch(dep) }}
              </el-tag>
              <span class="deploy-card__source cp-text-sm cp-text-secondary">{{ sourceLabel(dep) }}</span>
              <div class="cp-flex-1"></div>
              <span class="deploy-card__time cp-text-sm cp-text-secondary" :title="formatTime(dep.created_on, false)">
                {{ formatRelative(dep.created_on) }}
              </span>
            </div>
            <div v-if="deploymentCommit(dep)" class="deploy-card__commit">
              <span class="cp-ellipsis">{{ deploymentCommit(dep)!.message }}</span>
              <span v-if="deploymentCommit(dep)!.hash" class="cp-mono cp-text-secondary commit-hash">
                @{{ deploymentCommit(dep)!.hash!.slice(0, 7) }}
              </span>
            </div>
            <div class="deploy-card__meta">
              <a
                v-if="deploymentLink(dep)"
                :href="deploymentLink(dep)"
                target="_blank"
                rel="noopener"
                class="cp-mono cp-ellipsis cp-link"
              >
                <el-icon><Link /></el-icon>{{ deploymentLink(dep) }}
              </a>
              <span v-if="deploymentDuration(dep)" class="cp-text-sm cp-text-secondary">耗时 {{ deploymentDuration(dep) }}</span>
            </div>
            <div class="deploy-card__foot">
              <el-button size="small" text type="primary" @click="viewLogs(dep as CfPagesDeployment)">日志</el-button>
              <el-button size="small" text @click="retryDeploy(dep as CfPagesDeployment)">重试</el-button>
              <div class="cp-flex-1"></div>
              <span class="cp-mono cp-text-sm cp-text-secondary">{{ dep.id.slice(0, 12) }}…</span>
            </div>
          </div>
        </div>
      </template>
    </el-dialog>

    <!-- 部署日志 -->
    <el-dialog v-model="logsVisible" title="部署日志" width="680px" :append-to-body="true">
      <div class="log-viewer">
        <template v-if="logsLoading">
          <el-skeleton :rows="10" animated />
        </template>
        <template v-else>
          <div v-if="!logsLines.length" class="cp-empty">暂无日志</div>
          <div v-for="(line, index) in logsLines" :key="index" class="log-line">{{ line }}</div>
        </template>
      </div>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Connection, Link, Plus, Upload } from '@element-plus/icons-vue'
import { usePlatform } from '@/utils/platform'
import { useAccountStore } from '@/store/useAccountStore'
import { useResourceStore } from '@/store/useResourceStore'
import { useLogStore } from '@/store/useLogStore'
import { buildRequestContext } from '@/store/credentialService'
import * as pagesApi from '@/api/pages'
import { toBase64 } from '@/utils/crypto'
import { formatRelative, formatTime } from '@/utils/format'
import type { CfPagesDeployment, CfPagesProject } from '@/types'

const { isDesktop, isMobile } = usePlatform()
const accountStore = useAccountStore()
const resourceStore = useResourceStore()
const logStore = useLogStore()

const keyword = ref('')
const accountFilter = ref('')

const filteredProjects = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return resourceStore.pages.rows.filter((p) => {
    if (accountFilter.value && p.__accountId !== accountFilter.value) return false
    if (kw && !p.name.toLowerCase().includes(kw)) return false
    return true
  })
})

function accountName(accountId?: string): string {
  if (!accountId) return '-'
  return accountStore.accounts.find((a) => a.id === accountId)?.name ?? `未知账号(${accountId.slice(0, 6)})`
}

function stageLabel(status?: string): string {
  switch (status) {
    case 'success':
      return '成功'
    case 'failure':
      return '失败'
    case 'active':
      return '构建中'
    case 'queued':
      return '排队中'
    default:
      return status ?? '未知'
  }
}

function stageTagType(status?: string): 'success' | 'danger' | 'primary' | 'info' {
  if (status === 'success') return 'success'
  if (status === 'failure') return 'danger'
  if (status === 'active' || status === 'queued') return 'primary'
  return 'info'
}

/* ---------------- 部署卡片展示辅助 ---------------- */
interface DeploymentTrigger {
  type?: string
  metadata?: {
    commit_hash?: string
    commit_message?: string
    branch?: string
  }
}

function deploymentTrigger(dep: CfPagesDeployment): DeploymentTrigger {
  return dep.deployment_trigger ?? {}
}

function sourceLabel(dep: CfPagesDeployment): string {
  const type = deploymentTrigger(dep).type ?? dep.source?.type
  switch (type) {
    case 'github':
      return 'GitHub'
    case 'gitlab':
      return 'GitLab'
    case 'direct_upload':
    case 'upload':
      return '直接上传'
    default:
      return type ?? '手动'
  }
}

function deploymentBranch(dep: CfPagesDeployment): string {
  return deploymentTrigger(dep).metadata?.branch ?? ''
}

function deploymentCommit(dep: CfPagesDeployment): { message: string; hash?: string } | null {
  const md = deploymentTrigger(dep).metadata
  if (!md?.commit_message) return null
  return { message: md.commit_message, hash: md.commit_hash }
}

function deploymentLink(dep: CfPagesDeployment): string {
  return dep.aliases?.[0] ?? dep.url ?? ''
}

function deploymentDuration(dep: CfPagesDeployment): string {
  const start = dep.created_on ? new Date(dep.created_on).getTime() : 0
  const end = dep.latest_stage?.ended_on
    ? new Date(dep.latest_stage.ended_on).getTime()
    : dep.modified_on
      ? new Date(dep.modified_on).getTime()
      : 0
  if (!start || !end || end < start) return ''
  const sec = Math.round((end - start) / 1000)
  if (sec < 60) return `${sec}s`
  return `${Math.floor(sec / 60)}m${String(sec % 60).padStart(2, '0')}s`
}

async function onRefresh() {
  await resourceStore.loadPages(true)
}

/* ---------------- 项目 CRUD ---------------- */
interface ProjectForm {
  accountId: string
  name: string
  productionBranch: string
  buildCommand: string
  destDir: string
  rootDir: string
  /** 代码来源：none(直接上传) / github / gitlab */
  sourceType: '' | 'none' | 'github' | 'gitlab'
  owner: string
  repoName: string
}
const projectDialogVisible = ref(false)
const editingProject = ref<CfPagesProject | null>(null)
const savingProject = ref(false)
const projectForm = reactive<ProjectForm>({
  accountId: '',
  name: '',
  productionBranch: 'main',
  buildCommand: '',
  destDir: '',
  rootDir: '',
  sourceType: 'none',
  owner: '',
  repoName: ''
})

function openProjectDialog(project?: CfPagesProject) {
  editingProject.value = project ?? null
  projectForm.accountId = project?.__accountId ?? accountStore.accounts[0]?.id ?? ''
  projectForm.name = project?.name ?? ''
  projectForm.productionBranch = project?.production_branch ?? 'main'
  projectForm.buildCommand = project?.build_config?.build_command ?? ''
  projectForm.destDir = project?.build_config?.destination_dir ?? ''
  projectForm.rootDir = project?.build_config?.root_dir ?? ''
  // 编辑时回显已有来源
  const source = project?.source as { type?: string; config?: { owner?: string; repo_name?: string } } | undefined
  projectForm.sourceType = source?.type === 'github' || source?.type === 'gitlab' ? source.type : 'none'
  projectForm.owner = source?.config?.owner ?? ''
  projectForm.repoName = source?.config?.repo_name ?? ''
  projectDialogVisible.value = true
}

function buildConfigPayload() {
  return {
    build_command: projectForm.buildCommand.trim() || null,
    destination_dir: projectForm.destDir.trim() || null,
    root_dir: projectForm.rootDir.trim() || null
  }
}

async function saveProject() {
  const account = accountStore.accounts.find((a) => a.id === projectForm.accountId)
  if (!account) {
    ElMessage.warning('请选择所属账号')
    return
  }
  const name = projectForm.name.trim()
  if (!name) {
    ElMessage.warning('请填写项目名称')
    return
  }
  savingProject.value = true
  try {
    const ctx = await buildRequestContext(account)
    const base: {
      production_branch: string
      build_config: ReturnType<typeof buildConfigPayload>
      source?: { type: 'github' | 'gitlab'; config: { owner: string; repo_name: string; production_branch: string } }
    } = {
      production_branch: projectForm.productionBranch.trim() || 'main',
      build_config: buildConfigPayload()
    }
    // 新建且选择了代码仓库来源时，附加 source（GitHub / GitLab 账号需已在 Cloudflare 控制台授权）
    if (!editingProject.value && (projectForm.sourceType === 'github' || projectForm.sourceType === 'gitlab')) {
      if (!projectForm.owner.trim() || !projectForm.repoName.trim()) {
        ElMessage.warning('请填写仓库所属者与仓库名')
        return
      }
      base.source = {
        type: projectForm.sourceType,
        config: {
          owner: projectForm.owner.trim(),
          repo_name: projectForm.repoName.trim(),
          production_branch: projectForm.productionBranch.trim() || 'main'
        }
      }
    }
    if (editingProject.value) {
      await pagesApi.updatePagesProject(ctx, account.cfAccountId ?? '', editingProject.value.name, base)
      await logStore.write({
        module: 'pages',
        action: '编辑项目',
        detail: `编辑 Pages 项目「${editingProject.value.name}」`,
        accountId: account.id,
        accountName: account.name
      })
    } else {
      await pagesApi.createPagesProject(ctx, account.cfAccountId ?? '', { name, ...base })
      await logStore.write({
        module: 'pages',
        action: '新建项目',
        detail: `新建 Pages 项目「${name}」`,
        accountId: account.id,
        accountName: account.name
      })
    }
    ElMessage.success('已保存')
    projectDialogVisible.value = false
    await resourceStore.loadPages(true)
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    savingProject.value = false
  }
}

async function removeProject(project: CfPagesProject) {
  const account = accountStore.accounts.find((a) => a.id === project.__accountId)
  if (!account) {
    ElMessage.warning('未找到所属账号')
    return
  }
  await ElMessageBox.confirm(`确认删除 Pages 项目「${project.name}」？此操作不可恢复。`, '删除项目', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await pagesApi.deletePagesProject(ctx, account.cfAccountId ?? '', project.name)
    resourceStore.pages.rows = resourceStore.pages.rows.filter((p) => p.name !== project.name)
    ElMessage.success('已删除')
    await logStore.write({
      module: 'pages',
      action: '删除项目',
      detail: `删除 Pages 项目「${project.name}」`,
      level: 'warning',
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 部署管理 ---------------- */
const detailVisible = ref(false)
const detailProject = ref<CfPagesProject | null>(null)
const deployments = ref<CfPagesDeployment[]>([])
const deploymentsLoading = ref(false)
const triggering = ref(false)
const uploading = ref(false)
const uploadInput = ref<HTMLInputElement | null>(null)

async function openDetail(project: CfPagesProject) {
  detailProject.value = project
  detailVisible.value = true
  await refreshDeployments()
}

function pickUploadFolder() {
  const input = uploadInput.value
  if (input) {
    input.value = ''
    input.click()
  }
}

/** 计算文件 SHA-256（十六进制），用作资产 key 与 manifest 值 */
async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

function contentTypeFor(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    css: 'text/css',
    js: 'text/javascript',
    mjs: 'text/javascript',
    json: 'application/json',
    xml: 'application/xml',
    txt: 'text/plain',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    ico: 'image/x-icon',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    otf: 'font/otf',
    pdf: 'application/pdf',
    map: 'application/json'
  }
  return map[ext] ?? 'application/octet-stream'
}

async function onUploadFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  const project = detailProject.value
  const account = project ? accountStore.accounts.find((a) => a.id === project.__accountId) : undefined
  if (!project || !account || !files.length) return
  if (!account.cfAccountId) {
    ElMessage.warning('账号未回填 Cloudflare 账号 ID，请先在「账号管理」拉取资源')
    return
  }
  uploading.value = true
  try {
    const ctx = await buildRequestContext(account)
    const cfAccountId = account.cfAccountId

    // 1. 获取上传令牌
    const { jwt } = await pagesApi.getPagesUploadToken(ctx, cfAccountId, project.name)

    // 2. 计算每个文件哈希 + base64，按 path 分组（Chrome 目录选择会给出 webkitRelativePath）
    const manifest: Record<string, string> = {}
    const assets: Array<{ key: string; value: string; metadata: { contentType: string }; base64: boolean }> = []
    for (const file of files) {
      const buf = await file.arrayBuffer()
      const hash = await sha256Hex(buf)
      const rel = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
      const path = rel.startsWith('/') ? rel : `/${rel}`
      manifest[path] = hash
      assets.push({
        key: hash,
        value: toBase64(buf),
        metadata: { contentType: contentTypeFor(file.name) },
        base64: true
      })
    }

    // 3. 分批上传资产（JWT 鉴权）
    const BATCH = 200
    for (let i = 0; i < assets.length; i += BATCH) {
      await pagesApi.uploadPagesAssets(jwt, assets.slice(i, i + BATCH))
    }

    // 4. 创建部署
    await pagesApi.createDirectUploadDeployment(ctx, cfAccountId, project.name, manifest)
    ElMessage.success(`已上传 ${files.length} 个文件并创建部署`)
    await refreshDeployments()
    await logStore.write({
      module: 'pages',
      action: '直接上传部署',
      detail: `直接上传部署 Pages 项目「${project.name}」（${files.length} 个文件）`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    uploading.value = false
  }
}

async function refreshDeployments() {
  const project = detailProject.value
  const account = project ? accountStore.accounts.find((a) => a.id === project.__accountId) : undefined
  if (!project || !account) return
  deploymentsLoading.value = true
  try {
    const ctx = await buildRequestContext(account)
    deployments.value = await pagesApi.listPagesDeployments(ctx, account.cfAccountId ?? '', project.name)
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    deploymentsLoading.value = false
  }
}

async function triggerDeploy() {
  const project = detailProject.value
  const account = project ? accountStore.accounts.find((a) => a.id === project.__accountId) : undefined
  if (!project || !account) return
  triggering.value = true
  try {
    const ctx = await buildRequestContext(account)
    await pagesApi.triggerPagesDeployment(ctx, account.cfAccountId ?? '', project.name)
    ElMessage.success('已触发构建')
    await refreshDeployments()
    await logStore.write({
      module: 'pages',
      action: '触发构建',
      detail: `触发 Pages 项目「${project.name}」构建`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    triggering.value = false
  }
}

async function retryDeploy(deployment: CfPagesDeployment) {
  const project = detailProject.value
  const account = project ? accountStore.accounts.find((a) => a.id === project.__accountId) : undefined
  if (!project || !account) return
  try {
    const ctx = await buildRequestContext(account)
    await pagesApi.retryPagesDeployment(ctx, account.cfAccountId ?? '', project.name, deployment.id)
    ElMessage.success('已发起重试')
    await refreshDeployments()
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 部署日志 ---------------- */
const logsVisible = ref(false)
const logsLoading = ref(false)
const logsLines = ref<string[]>([])

async function viewLogs(deployment: CfPagesDeployment) {
  const project = detailProject.value
  const account = project ? accountStore.accounts.find((a) => a.id === project.__accountId) : undefined
  if (!project || !account) return
  logsVisible.value = true
  logsLoading.value = true
  logsLines.value = []
  try {
    const ctx = await buildRequestContext(account)
    const data = await pagesApi.getDeploymentLogs(ctx, account.cfAccountId ?? '', project.name, deployment.id)
    logsLines.value = data.data?.map((l) => l.line) ?? []
  } catch {
    logsLines.value = ['（日志接口暂时不可用，请稍后重试）']
  } finally {
    logsLoading.value = false
  }
}

onMounted(async () => {
  await accountStore.load()
  if (!resourceStore.pages.loaded) {
    await resourceStore.loadPages()
  }
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.project-search {
  width: 260px;

  @include mobile {
    width: 100%;
  }
}

.project-table {
  @include card;
}

.project-name {
  color: var(--cp-primary);
  font-size: 13.5px;
}

.detail-head {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 12px;

  @include mobile {
    grid-template-columns: 1fr;
  }

  &__item {
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
}

.deploy-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.log-viewer {
  max-height: 60vh;
  overflow: auto;
  padding: 12px;
  border-radius: $radius-sm;
  background: var(--cp-bg-sunken);
  font-family: var(--cp-font-mono, monospace);
  font-size: 12px;
  line-height: 1.6;
}

.deploy-list {
  min-height: 120px;
}

.deploy-card {
  @include card;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;

  & + & {
    margin-top: 10px;
  }

  &__head {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;

    @include mobile {
      flex-wrap: wrap;
    }
  }

  &__branch {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    max-width: 180px;

    .el-icon {
      font-size: 12px;
    }
  }

  &__source {
    flex: none;
  }

  &__time {
    flex: none;
  }

  &__commit {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 13px;

    > .cp-ellipsis {
      min-width: 0;
    }

    .commit-hash {
      flex: none;
      font-size: 12px;
    }
  }

  &__meta {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;

    a {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      min-width: 0;
      font-size: 12px;

      .el-icon {
        font-size: 12.5px;
      }
    }
  }

  &__foot {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-top: 6px;
    border-top: 1px dashed var(--cp-border-light);
  }
}

.log-line {
  border-bottom: 1px dashed var(--cp-border-light);

  &:last-child {
    border-bottom: none;
  }
}
</style>
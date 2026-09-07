<template>
  <div class="cp-page workers-page">
    <!-- ================= Workers 列表（/workers） ================= -->
    <template v-if="!scriptName">
      <div class="cp-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索脚本"
          clearable
          class="script-search"
          :prefix-icon="'Search'"
        />
        <el-select v-model="accountFilter" placeholder="全部账号" clearable style="width: 170px">
          <el-option v-for="acc in accountStore.accounts" :key="acc.id" :label="acc.name" :value="acc.id" />
        </el-select>
        <div class="cp-flex-1"></div>
        <el-button type="primary" @click="openCreateDialog">
          <el-icon><Plus /></el-icon>{{ isMobile ? '新增' : '新增 Worker' }}
        </el-button>
        <el-button :loading="resourceStore.workers.loading" @click="onRefresh">刷新</el-button>
      </div>

      <!-- 桌面表格 -->
      <template v-if="isDesktop">
        <el-table :data="filteredScripts" v-loading="resourceStore.workers.loading" class="script-table">
          <el-table-column label="脚本名称" min-width="240">
            <template #default="{ row }">
              <router-link :to="detailLink(row)" class="script-name cp-text-bold">{{ row.id }}</router-link>
              <div class="cp-text-sm cp-text-secondary">{{ row.handlers?.length ? `handlers: ${row.handlers.join(', ')}` : 'Cloudflare Worker' }}</div>
            </template>
          </el-table-column>
          <el-table-column label="账号 / 域名" min-width="220">
            <template #default="{ row }">
              <div class="script-acc">{{ accountName(row.__accountId) }}</div>
              <a
                v-if="workerLink(row)"
                :href="workerLink(row)"
                target="_blank"
                rel="noopener"
                class="cp-link cp-text-sm"
              >
                {{ workerLinkLabel(row) }}
              </a>
              <span v-else class="cp-text-secondary cp-text-sm">-</span>
            </template>
          </el-table-column>
          <el-table-column label="兼容日期" width="140">
            <template #default="{ row }">{{ row.compatibility_date ?? '-' }}</template>
          </el-table-column>
          <el-table-column label="修改时间" min-width="170">
            <template #default="{ row }">{{ formatTime(row.modified_on, false) }}</template>
          </el-table-column>
          <el-table-column label="操作" width="130" fixed="right">
            <template #default="{ row }">
              <el-button size="small" text type="primary" @click="goDetail(row)">详情</el-button>
              <el-button size="small" text type="danger" @click="removeScript(row)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <!-- 移动端列表 -->
      <template v-else>
        <el-empty v-if="!filteredScripts.length" description="暂无 Worker 脚本" />
        <template v-for="row in filteredScripts" :key="row.id">
          <div class="cp-list-card" @click="goDetail(row)">
            <div class="cp-list-card__head">
              <span class="cp-list-card__title cp-mono">{{ row.id }}</span>
              <el-tag size="small" effect="light" type="primary">Worker</el-tag>
            </div>
            <div class="cp-list-card__row"><span>账号</span><span>{{ accountName(row.__accountId) }}</span></div>
            <div class="cp-list-card__row">
              <span>域名</span>
              <a v-if="workerLink(row)" :href="workerLink(row)" target="_blank" rel="noopener" class="cp-link cp-text-sm">
                {{ workerLinkLabel(row) }}
              </a>
              <span v-else>-</span>
            </div>
            <div class="cp-list-card__row"><span>修改时间</span><span>{{ formatTime(row.modified_on, false) }}</span></div>
            <div class="cp-list-card__actions">
              <van-button size="mini" type="danger" plain @click.stop="removeScript(row)">删除</van-button>
            </div>
          </div>
        </template>
      </template>
    </template>

    <!-- ================= Worker 详情（/workers/:script） ================= -->
    <template v-else>
      <div class="worker-head">
        <el-button link @click="backToList">
          <el-icon><ArrowLeft /></el-icon>&nbsp;返回
        </el-button>
        <div class="worker-head__info">
          <span class="cp-text-bold cp-text-lg cp-mono">{{ scriptName }}</span>
          <el-tag size="small" effect="light" type="primary">Worker</el-tag>
          <span class="cp-text-secondary cp-text-sm">{{ accountName(currentAccountId) }}</span>
          <span class="worker-head__links">
            <a
              v-if="workerWebsite"
              :href="workerWebsite"
              target="_blank"
              rel="noopener"
              class="worker-head__link"
              @click.stop
            >
              <el-icon><Link /></el-icon>{{ workerWebsite }}
            </a>
            <a
              v-for="d in headDomains"
              :key="d.id"
              :href="`https://${d.hostname}`"
              target="_blank"
              rel="noopener"
              class="worker-head__link"
              @click.stop
            >
              <el-icon><Link /></el-icon>{{ d.hostname }}
            </a>
          </span>
        </div>
        <div class="cp-flex-1"></div>
        <el-button :loading="detailLoading" @click="loadDetail">刷新</el-button>
      </div>

      <el-empty
        v-if="!currentScript"
        description="未找到该脚本，可能已删除或账号凭据失效"
      >
        <el-button type="primary" @click="loadWorkersAndRetry">重新加载列表</el-button>
      </el-empty>

      <template v-else>
        <!-- 桌面 Tabs -->
        <el-tabs v-if="isDesktop" v-model="activeTab" class="worker-tabs">
          <el-tab-pane label="代码与部署" name="code">
            <el-alert v-if="codeError" :title="codeError" type="error" :closable="false" show-icon class="cp-alert-row" />
            <div class="deploy-bar">
              <span class="cp-text-sm cp-text-secondary">兼容日期</span>
              <el-input v-model="compatDate" style="width: 160px" placeholder="2024-01-01" />
              <div class="cp-flex-1"></div>
              <el-button :loading="deploying" :disabled="!code.trim()" type="primary" @click="deploy">
                <el-icon><Upload /></el-icon>&nbsp;部署
              </el-button>
            </div>
            <div v-if="deployStatus.state !== 'idle'" class="deploy-status" :class="`is-${deployStatus.state}`">
              <el-icon v-if="deployStatus.state === 'running'" class="is-loading"><Loading /></el-icon>
              <span v-else class="deploy-status__dot"></span>
              <span class="cp-text-sm">{{ deployStatusText() }}</span>
              <span v-if="deployStatus.at" class="cp-text-secondary cp-text-sm">{{ formatTime(deployStatus.at, false) }}</span>
            </div>
            <CodeEditor v-model="code" mode="js" :height="'480px'" />
            <div v-if="deployHistory.length" class="deploy-log">
              <div class="deploy-log__title">最近部署记录</div>
              <div v-for="h in deployHistory" :key="h.at" class="deploy-log__row">
                <el-tag size="small" effect="plain" :type="h.state === 'success' ? 'success' : 'danger'">
                  {{ h.state === 'success' ? '成功' : '失败' }}
                </el-tag>
                <span class="cp-text-sm cp-ellipsis">{{ h.message }}</span>
                <span class="cp-text-secondary cp-text-sm">{{ formatTime(h.at, false) }}</span>
              </div>
            </div>
          </el-tab-pane>

          <el-tab-pane label="环境变量" name="vars">
            <el-alert v-if="varsError" :title="varsError" type="error" :closable="false" show-icon class="cp-alert-row" />
            <div class="deploy-bar">
              <span class="cp-text-sm cp-text-secondary">共 {{ bindings.length }} 个变量</span>
              <div class="cp-flex-1"></div>
              <el-button type="primary" @click="openBindingDialog()">
                <el-icon><Plus /></el-icon>新增变量
              </el-button>
            </div>
            <el-empty v-if="!varsError && !bindings.length" description="暂无变量" />
            <el-table v-if="bindings.length || varsError" :data="bindings" v-loading="bindingsLoading" class="vars-table">
              <el-table-column label="名称" min-width="180">
                <template #default="{ row }"><span class="cp-mono">{{ row.binding ?? row.name }}</span></template>
              </el-table-column>
              <el-table-column label="类型" width="140">
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :type="bindingTagType(row.type)">{{ bindingTypeLabel(row.type) }}</el-tag>
                </template>
              </el-table-column>
              <el-table-column label="值" min-width="200">
                <template #default="{ row }">
                  <span v-if="row.type === 'secret_text'" class="cp-text-secondary cp-mono">••••••（已加密）</span>
                  <span v-else class="cp-mono cp-ellipsis">{{ row.text }}</span>
                </template>
              </el-table-column>
              <el-table-column label="操作" width="140" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" text type="primary" @click="openBindingDialog(row)">编辑</el-button>
                  <el-button size="small" text type="danger" @click="removeBinding(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="域名配置" name="domains">
            <el-alert v-if="domainsError" :title="domainsError" type="error" :closable="false" show-icon class="cp-alert-row" />
            <div v-if="workerWebsite" class="deploy-bar">
              <span class="cp-text-sm cp-text-secondary">默认 Website</span>
              <a :href="workerWebsite" target="_blank" rel="noopener" class="cp-mono cp-link">{{ workerWebsite }}</a>
              <div class="cp-flex-1"></div>
            </div>
            <div class="deploy-bar">
              <span class="cp-text-sm cp-text-secondary">共 {{ domains.length }} 个自定义域名</span>
              <div class="cp-flex-1"></div>
              <el-button type="primary" @click="openDomainDialog()">
                <el-icon><Plus /></el-icon>新增域名
              </el-button>
            </div>
            <el-empty v-if="!domainsError && !domains.length" description="暂无自定义域名" />
            <el-table :data="domains" v-loading="domainsLoading" class="routes-table">
              <el-table-column label="主机名" min-width="220">
                <template #default="{ row }"><span class="cp-mono">{{ row.hostname }}</span></template>
              </el-table-column>
              <el-table-column label="所属域名" min-width="180">
                <template #default="{ row }">{{ row.zone_name ?? '-' }}</template>
              </el-table-column>
              <el-table-column label="环境" width="120">
                <template #default="{ row }"><el-tag size="small" effect="plain">{{ row.environment ?? 'production' }}</el-tag></template>
              </el-table-column>
              <el-table-column label="创建时间" min-width="160">
                <template #default="{ row }">{{ formatTime(row.created_on, false) }}</template>
              </el-table-column>
              <el-table-column label="操作" width="110" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" text type="danger" @click="removeDomain(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>

          <el-tab-pane label="路由规则" name="routes">
            <el-alert v-if="routesError" :title="routesError" type="error" :closable="false" show-icon class="cp-alert-row" />
            <div class="deploy-bar">
              <span class="cp-text-sm cp-text-secondary">共 {{ routes.length }} 条路由</span>
              <div class="cp-flex-1"></div>
              <el-button type="primary" @click="openRouteDialog()">
                <el-icon><Plus /></el-icon>新增路由
              </el-button>
            </div>
            <el-empty v-if="!routesError && !routes.length" description="暂无路由" />
            <el-table :data="routes" v-loading="routesLoading" class="routes-table">
              <el-table-column label="匹配模式" min-width="220">
                <template #default="{ row }"><span class="cp-mono">{{ row.pattern }}</span></template>
              </el-table-column>
              <el-table-column label="域名" min-width="200">
                <template #default="{ row }">{{ zoneName(row.zone_id) }}</template>
              </el-table-column>
              <el-table-column label="脚本" min-width="160">
                <template #default="{ row }"><span class="cp-mono">{{ row.script ?? '-' }}</span></template>
              </el-table-column>
              <el-table-column label="操作" width="150" fixed="right">
                <template #default="{ row }">
                  <el-button size="small" text type="warning" @click="unbindRoute(row)">解绑</el-button>
                  <el-button size="small" text type="danger" @click="removeRoute(row)">删除</el-button>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>

        <!-- 移动端 Tabs -->
        <template v-else>
          <van-tabs v-model:active="mobileTab" class="worker-tabs-m">
            <van-tab title="代码">
              <div class="deploy-bar">
                <el-input v-model="compatDate" size="small" style="width: 130px" placeholder="兼容日期" />
                <el-button size="small" :loading="deploying" :disabled="!code.trim()" type="primary" @click="deploy">
                  部署
                </el-button>
              </div>
              <CodeEditor v-model="code" mode="js" :height="'40vh'" />
              <el-alert v-if="codeError" :title="codeError" type="error" :closable="false" show-icon />
              <div v-if="deployStatus.state !== 'idle'" class="deploy-status" :class="`is-${deployStatus.state}`">
                <el-icon v-if="deployStatus.state === 'running'" class="is-loading"><Loading /></el-icon>
                <span v-else class="deploy-status__dot"></span>
                <span class="cp-text-sm">{{ deployStatusText() }}</span>
              </div>
              <div v-if="deployHistory.length" class="deploy-log">
                <div class="deploy-log__title">最近部署记录</div>
                <div v-for="h in deployHistory" :key="h.at" class="deploy-log__row">
                  <el-tag size="small" effect="plain" :type="h.state === 'success' ? 'success' : 'danger'">
                    {{ h.state === 'success' ? '成功' : '失败' }}
                  </el-tag>
                  <span class="cp-text-sm cp-ellipsis">{{ h.message }}</span>
                  <span class="cp-text-secondary cp-text-sm">{{ formatTime(h.at, false) }}</span>
                </div>
              </div>
            </van-tab>
            <van-tab title="变量">
              <div class="tab-pad">
                <van-button size="small" type="primary" block @click="openBindingDialog()">新增变量</van-button>
                <el-alert v-if="varsError" :title="varsError" type="error" :closable="false" show-icon />
                <el-empty v-if="!varsError && !bindings.length" description="暂无变量" />
                <div v-for="b in bindings" :key="b.binding ?? b.name" class="cp-list-card">
                  <div class="cp-list-card__head">
                    <span class="cp-list-card__title cp-mono">{{ b.binding ?? b.name }}</span>
                    <el-tag size="small" effect="plain" :type="bindingTagType(b.type)">{{ bindingTypeLabel(b.type) }}</el-tag>
                  </div>
                  <div class="cp-list-card__row"><span>值</span><span class="cp-mono cp-ellipsis">{{ b.type === 'secret_text' ? '••••••（已加密）' : b.text }}</span></div>
                  <div class="cp-list-card__actions">
                    <van-button size="mini" type="primary" plain @click="openBindingDialog(b)">编辑</van-button>
                    <van-button size="mini" type="danger" plain @click="removeBinding(b)">删除</van-button>
                  </div>
                </div>
              </div>
            </van-tab>
            <van-tab title="域名">
              <div class="tab-pad">
                <a v-if="workerWebsite" :href="workerWebsite" target="_blank" rel="noopener" class="cp-mono cp-link website-link">
                  {{ workerWebsite }}
                </a>
                <van-button size="small" type="primary" block @click="openDomainDialog()">新增域名</van-button>
                <el-alert v-if="domainsError" :title="domainsError" type="error" :closable="false" show-icon />
                <el-empty v-if="!domainsError && !domains.length" description="暂无自定义域名" />
                <div v-for="d in domains" :key="d.id" class="cp-list-card">
                  <div class="cp-list-card__head">
                    <span class="cp-list-card__title cp-mono">{{ d.hostname }}</span>
                    <van-button size="mini" type="danger" plain @click="removeDomain(d)">删除</van-button>
                  </div>
                  <div class="cp-list-card__row"><span>所属域名</span><span>{{ d.zone_name ?? '-' }}</span></div>
                </div>
              </div>
            </van-tab>
            <van-tab title="路由">
              <div class="tab-pad">
                <van-button size="small" type="primary" block @click="openRouteDialog()">新增路由</van-button>
                <el-alert v-if="routesError" :title="routesError" type="error" :closable="false" show-icon />
                <el-empty v-if="!routesError && !routes.length" description="暂无路由" />
                <div v-for="r in routes" :key="r.id" class="cp-list-card">
                  <div class="cp-list-card__head">
                    <span class="cp-list-card__title cp-mono">{{ r.pattern }}</span>
                  </div>
                  <div class="cp-list-card__row"><span>域名</span><span>{{ zoneName(r.zone_id) }}</span></div>
                  <div class="cp-list-card__actions">
                    <van-button size="mini" type="warning" plain @click="unbindRoute(r)">解绑</van-button>
                    <van-button size="mini" type="danger" plain @click="removeRoute(r)">删除</van-button>
                  </div>
                </div>
              </div>
            </van-tab>
          </van-tabs>
        </template>
      </template>
    </template>

    <!-- 新增 Worker -->
    <el-dialog v-model="createVisible" title="新增 Worker" width="480px" :append-to-body="true" @close="createVisible = false">
      <el-form label-width="70px" label-position="left">
        <el-form-item label="所属账号">
          <el-select v-model="createForm.accountId" style="width: 100%" placeholder="选择账号">
            <el-option v-for="acc in accountStore.accounts" :key="acc.id" :label="acc.name" :value="acc.id" />
          </el-select>
        </el-form-item>
        <el-form-item label="脚本名称">
          <el-input v-model="createForm.name" placeholder="例如 my-worker（小写字母、数字、连字符）" class="cp-mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="createWorker">创建</el-button>
      </template>
    </el-dialog>

    <!-- 新增 / 编辑环境变量 -->
    <el-dialog
      :model-value="bindingDialogVisible"
      :title="editingBinding ? '编辑变量' : '新增变量'"
      width="480px"
      :append-to-body="true"
      @close="bindingDialogVisible = false"
    >
      <el-form label-width="70px" label-position="left">
        <el-form-item label="名称">
          <el-input v-model="bindingForm.name" :disabled="!!editingBinding" placeholder="变量名，如 API_TOKEN" class="cp-mono" />
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="bindingForm.type" style="width: 100%">
            <el-option label="普通文本（明文）" value="plain_text" />
            <el-option label="密钥（加密存储）" value="secret_text" />
            <el-option label="JSON" value="json" />
          </el-select>
        </el-form-item>
        <el-form-item :label="bindingForm.type === 'secret_text' ? '密钥值' : '值'">
          <el-input
            v-model="bindingValueText"
            :type="bindingForm.type === 'secret_text' ? 'password' : 'textarea'"
            :rows="bindingForm.type === 'json' ? 6 : 2"
            :placeholder="bindingValuePlaceholder"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bindingDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingBindings" @click="saveBinding">保存</el-button>
      </template>
    </el-dialog>

    <!-- 新增自定义域名 -->
    <el-dialog
      :model-value="domainDialogVisible"
      title="新增自定义域名"
      width="480px"
      :append-to-body="true"
      @close="domainDialogVisible = false"
    >
      <el-form label-width="70px" label-position="left">
        <el-form-item label="主机名">
          <el-input v-model="domainForm.hostname" :placeholder="domainHostnamePlaceholder" class="cp-mono" />
        </el-form-item>
        <el-form-item label="所属域名">
          <el-select v-model="domainForm.zoneId" style="width: 100%" filterable placeholder="选择 Cloudflare 已有域名">
            <el-option
              v-for="z in accountZones"
              :key="z.id"
              :label="z.name"
              :value="z.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <div class="cp-text-sm cp-text-secondary" style="padding: 0 0 8px 70px">
        Cloudflare 将自动为所选域名下的该主机名创建 DNS 记录并签发 TLS 证书。
      </div>
      <template #footer>
        <el-button @click="domainDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingDomain" @click="saveDomain">添加</el-button>
      </template>
    </el-dialog>

    <!-- 新增路由 -->
    <el-dialog
      :model-value="routeDialogVisible"
      title="新增路由"
      width="480px"
      :append-to-body="true"
      @close="routeDialogVisible = false"
    >
      <el-form label-width="70px" label-position="left">
        <el-form-item label="匹配模式">
          <el-input v-model="routeForm.pattern" placeholder="例如 example.com/api/*" class="cp-mono" />
        </el-form-item>
        <el-form-item label="所属域名">
          <el-select v-model="routeForm.zoneId" style="width: 100%" filterable>
            <el-option
              v-for="zone in accountZones"
              :key="zone.id"
              :label="zone.name"
              :value="zone.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="绑定脚本">
          <el-input :model-value="scriptName" disabled class="cp-mono" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="routeDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="savingRoute" :disabled="!routeForm.pattern || !routeForm.zoneId" @click="saveRoute">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ArrowLeft, Link, Loading, Plus, Upload } from '@element-plus/icons-vue'
import CodeEditor from '@/components/CodeEditor.vue'
import { usePlatform } from '@/utils/platform'
import { useAccountStore } from '@/store/useAccountStore'
import { useResourceStore } from '@/store/useResourceStore'
import { useLogStore } from '@/store/useLogStore'
import { buildRequestContext } from '@/store/credentialService'
import * as workersApi from '@/api/workers'
import { formatTime } from '@/utils/format'
import { runWithConcurrency } from '@/utils/scheduler'
import type { CfWorkerDomain, CfWorkerRoute, CfWorkerScript, CfWorkerVariable } from '@/types'

const route = useRoute()
const router = useRouter()
const { isDesktop, isMobile } = usePlatform()
const accountStore = useAccountStore()
const resourceStore = useResourceStore()
const logStore = useLogStore()

const scriptName = computed(() => (route.params.script as string | undefined) ?? '')
const accountIdQuery = computed(() => (route.query.accountId as string | undefined) ?? '')

/* ---------------- 列表 ---------------- */
const keyword = ref('')
const accountFilter = ref('')

const filteredScripts = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return resourceStore.workers.rows.filter((s) => {
    if (accountFilter.value && s.__accountId !== accountFilter.value) return false
    if (kw && !s.id.toLowerCase().includes(kw)) return false
    return true
  })
})

const currentAccountId = computed(() => {
  if (accountIdQuery.value) return accountIdQuery.value
  const scr = currentScript.value
  return scr?.__accountId ?? ''
})

const currentScript = computed(() => {
  if (!scriptName.value) return null
  let row: CfWorkerScript | undefined
  if (accountIdQuery.value) {
    row = resourceStore.workers.rows.find(
      (s) => s.id === scriptName.value && s.__accountId === accountIdQuery.value
    )
  }
  return row ?? resourceStore.workers.rows.find((s) => s.id === scriptName.value) ?? null
})

function detailLink(script: CfWorkerScript) {
  return { path: `/workers/${encodeURIComponent(script.id)}`, query: { accountId: script.__accountId } }
}

function goDetail(script: CfWorkerScript) {
  router.push(detailLink(script))
}

function accountName(accountId?: string): string {
  if (!accountId) return '-'
  return accountStore.resolveAccount(accountId)?.name ?? `未知账号(${accountId.slice(0, 6)})`
}

/* ---------------- 列表域名链接 ---------------- */
/** 账号全部自定义域名：service(worker 名) -> domains[] */
const accountDomains = ref(new Map<string, CfWorkerDomain[]>())
/** 账号 cfAccountId -> workers.dev 子域名 */
const subdomainByAccount = ref(new Map<string, string>())

async function loadDomainsForList() {
  const accs = accountStore.accounts.filter((a) => !!a.cfAccountId)
  const domainsMap = new Map<string, CfWorkerDomain[]>()
  const subMap = new Map<string, string>()
  await runWithConcurrency(accs, 3, async (account) => {
    try {
      const ctx = await buildRequestContext(account)
      const all = await workersApi.listAllWorkerDomains(ctx, account.cfAccountId!)
      for (const d of all) {
        const key = d.service
        if (!key) continue
        const list = domainsMap.get(key) ?? []
        list.push(d)
        domainsMap.set(key, list)
      }
      try {
        const info = await workersApi.getWorkerSubdomain(ctx, account.cfAccountId!)
        if (info?.subdomain) subMap.set(account.cfAccountId!, info.subdomain)
      } catch {
        /* 忽略子域名读取失败 */
      }
    } catch {
      /* 忽略单个账号失败 */
    }
  })
  accountDomains.value = domainsMap
  subdomainByAccount.value = subMap
}

/** 列表行链接：优先自定义域名，否则默认 workers.dev */
function workerLink(row: CfWorkerScript): string {
  const acc = accountStore.resolveAccount(row.__accountId)
  const domains = accountDomains.value.get(row.id) ?? []
  if (domains.length) return `https://${domains[0].hostname}`
  if (acc?.cfAccountId) {
    const sub = subdomainByAccount.value.get(acc.cfAccountId)
    if (sub) return `https://${row.id}.${sub}.workers.dev`
  }
  return ''
}

function workerLinkLabel(row: CfWorkerScript): string {
  const domains = accountDomains.value.get(row.id) ?? []
  if (domains.length) return domains[0].hostname
  const acc = accountStore.resolveAccount(row.__accountId)
  if (acc?.cfAccountId) {
    const sub = subdomainByAccount.value.get(acc.cfAccountId)
    if (sub) return `${row.id}.${sub}.workers.dev`
  }
  return ''
}

async function onRefresh() {
  await resourceStore.loadWorkers(true)
  await loadDomainsForList()
}

/* ---------------- 新增 Worker ---------------- */
/** 默认 ESM 模板：可直接部署并继续编辑 */
const DEFAULT_WORKER_CODE = `export default {
  async fetch(request, env, ctx) {
    return new Response('Hello from the edge!', {
      status: 200,
      headers: { 'content-type': 'text/plain' }
    })
  }
}
`

const createVisible = ref(false)
const creating = ref(false)
const createForm = reactive({ accountId: '', name: '' })

function openCreateDialog() {
  createForm.accountId =
    accountStore.accounts.find((a) => !!a.cfAccountId)?.id ?? accountStore.accounts[0]?.id ?? ''
  createForm.name = ''
  createVisible.value = true
}

async function createWorker() {
  const name = createForm.name.trim()
  if (!name) {
    ElMessage.warning('请填写脚本名称')
    return
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    ElMessage.warning('脚本名称仅支持字母、数字、连字符与下划线')
    return
  }
  const account = accountStore.resolveAccount(createForm.accountId)
  if (!account) {
    ElMessage.warning('请选择账号')
    return
  }
  if (!account.cfAccountId) {
    ElMessage.warning('该账号未回填 Cloudflare 账号 ID，请先在「账号管理」对该账号执行「拉取资源」')
    return
  }
  creating.value = true
  try {
    const ctx = await buildRequestContext(account)
    await workersApi.deployWorkerScript(ctx, account.cfAccountId, name, DEFAULT_WORKER_CODE, {
      main_module: 'module'
    })
    await logStore.write({
      module: 'workers',
      action: '新增 Worker',
      detail: `创建 Worker「${name}」`,
      accountId: account.id,
      accountName: account.name
    })
    ElMessage.success(`Worker「${name}」已创建`)
    createVisible.value = false
    await resourceStore.loadWorkers(true)
    router.push({ path: `/workers/${encodeURIComponent(name)}`, query: { accountId: account.id } })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    creating.value = false
  }
}

async function removeScript(script: CfWorkerScript) {
  const account = accountStore.accounts.find((a) => a.id === script.__accountId)
  if (!account) {
    ElMessage.warning('未找到所属账号')
    return
  }
  await ElMessageBox.confirm(`确认删除 Worker 脚本「${script.id}」？此操作不可恢复。`, '删除脚本', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await workersApi.deleteWorkerScript(ctx, account.cfAccountId ?? '', script.id)
    resourceStore.workers.rows = resourceStore.workers.rows.filter(
      (s) => !(s.id === script.id && s.__accountId === script.__accountId)
    )
    ElMessage.success('已删除')
    await logStore.write({
      module: 'workers',
      action: '删除脚本',
      detail: `删除 Worker 脚本「${script.id}」`,
      level: 'warning',
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 详情：数据加载 ---------------- */
const activeTab = ref('code')
const mobileTab = ref(0)
const detailLoading = ref(false)
const code = ref('')
const compatDate = ref('')
const deploying = ref(false)
/** 部署状态：idle / running / success / error */
const deployStatus = ref<{ state: 'idle' | 'running' | 'success' | 'error'; message: string; at: number }>({
  state: 'idle',
  message: '',
  at: 0
})
/** 最近部署记录（内存态，最多保留 10 条） */
const deployHistory = ref<Array<{ at: number; state: 'success' | 'error'; message: string }>>([])

function pushDeployHistory(state: 'success' | 'error', message: string) {
  deployHistory.value = [
    { at: Date.now(), state, message },
    ...deployHistory.value
  ].slice(0, 10)
}

function deployStatusText(): string {
  const s = deployStatus.value
  if (s.state === 'running') return '正在部署…'
  if (s.state === 'success') return `部署成功：${s.message || '已完成'}`
  if (s.state === 'error') return `部署失败：${s.message}`
  return ''
}
const bindings = ref<CfWorkerVariable[]>([])
const bindingsLoading = ref(false)
const routes = ref<CfWorkerRoute[]>([])
const routesLoading = ref(false)
const codeError = ref('')
const varsError = ref('')
const routesError = ref('')

async function currentContext() {
  const accountId = currentAccountId.value
  const account = accountStore.resolveAccount(accountId)
  if (!account) return null
  return account
}

async function loadDetail() {
  const account = await currentContext()
  if (!account || !scriptName.value) return
  detailLoading.value = true
  codeError.value = ''
  varsError.value = ''
  try {
    const ctx = await buildRequestContext(account)
    const cfAccountId = account.cfAccountId
    if (!cfAccountId) {
      codeError.value = '账号未绑定 Cloudflare 账号 ID，请先在「账号管理」对该账号执行一次「拉取资源」'
      return
    }
    // 各部分独立拉取，避免一处失败拖垮全部
    try {
      const content = await workersApi.getWorkerScriptContent(ctx, cfAccountId, scriptName.value)
      if (!content) {
        codeError.value =
          'Cloudflare 未返回脚本内容（result 为空）。请确认该账号已在「账号管理」执行「拉取资源」回填 account_id，且 Token 具备 Workers 读取权限。'
        code.value = ''
      } else {
        code.value =
          content.body ??
          content.script ??
          content.modules?.[0]?.content ??
          content.content ??
          ''
      }
    } catch (error) {
      codeError.value = (error as Error).message
      code.value = ''
    }
    try {
      const meta = await workersApi.getWorkerScript(ctx, cfAccountId, scriptName.value)
      compatDate.value = meta?.compatibility_date ?? '2024-01-01'
    } catch {
      /* 元信息缺失可忽略 */
    }
    try {
      bindings.value = await workersApi.listWorkerBindings(ctx, cfAccountId, scriptName.value)
    } catch (error) {
      varsError.value = (error as Error).message
      bindings.value = []
    }
  } finally {
    detailLoading.value = false
  }
  await loadRoutes()
  await loadDomains()
}

function loadWorkersAndRetry() {
  return resourceStore.loadWorkers(true).then(() => loadDetail())
}

/* ---------------- 部署 ---------------- */
async function deploy() {
  const account = await currentContext()
  if (!account || !scriptName.value) return
  if (!code.value.trim()) {
    ElMessage.warning('代码为空，无法部署')
    return
  }
  deploying.value = true
  deployStatus.value = { state: 'running', message: '', at: Date.now() }
  try {
    const ctx = await buildRequestContext(account)
    await workersApi.deployWorkerScript(ctx, account.cfAccountId ?? '', scriptName.value, code.value, {
      main_module: 'module',
      compatibility_date: compatDate.value || '2024-01-01'
    })
    deployStatus.value = { state: 'success', message: `已部署至 ${scriptName.value}`, at: Date.now() }
    pushDeployHistory('success', `部署 ${scriptName.value}`)
    ElMessage.success('部署成功')
    await logStore.write({
      module: 'workers',
      action: '部署脚本',
      detail: `部署 Worker「${scriptName.value}」`,
      accountId: account.id,
      accountName: account.name
    })
    await resourceStore.loadWorkers(true)
  } catch (error) {
    const message = (error as Error).message
    deployStatus.value = { state: 'error', message, at: Date.now() }
    pushDeployHistory('error', message)
    ElMessage.error(message)
  } finally {
    deploying.value = false
  }
}

/* ---------------- 环境变量 ---------------- */
interface BindingForm {
  name: string
  type: 'plain_text' | 'secret_text' | 'json'
}
const bindingDialogVisible = ref(false)
const editingBinding = ref<CfWorkerVariable | null>(null)
const savingBindings = ref(false)
const bindingForm = reactive<BindingForm>({ name: '', type: 'plain_text' })
const bindingValueText = ref('')

function bindingTypeLabel(type?: string): string {
  switch (type) {
    case 'plain_text':
      return '明文'
    case 'secret_text':
      return '密钥'
    case 'json':
      return 'JSON'
    default:
      return type ?? '-'
  }
}

/** 变量值输入框占位文案 */
const bindingValuePlaceholder = computed(() => {
  if (bindingForm.type === 'json') return '{\n  "key": "value"\n}'
  return '变量值'
})

function bindingTagType(type?: string): 'primary' | 'danger' | 'warning' | 'info' {
  if (type === 'secret_text') return 'danger'
  if (type === 'json') return 'warning'
  if (type === 'plain_text') return 'primary'
  return 'info'
}

function openBindingDialog(variable?: CfWorkerVariable) {
  editingBinding.value = variable ?? null
  bindingForm.name = variable?.binding ?? variable?.name ?? ''
  bindingForm.type = (variable?.type as BindingForm['type']) ?? 'plain_text'
  bindingValueText.value = variable?.type === 'secret_text' ? '' : (variable?.text ?? '')
  bindingDialogVisible.value = true
}

function buildBindingPayload(): { type: 'plain_text' | 'secret_text' | 'json'; name: string; text?: string; json?: string }[] {
  return bindings.value.map((b) => {
    const name = b.binding ?? b.name ?? ''
    const type = b.type ?? 'plain_text'
    if (type === 'secret_text') return { type: 'secret_text', name }
    if (type === 'json') return { type: 'json', name, json: b.text ?? '' }
    return { type: 'plain_text', name, text: b.text ?? '' }
  })
}

async function saveBinding() {
  const account = await currentContext()
  if (!account || !scriptName.value) return
  if (!bindingForm.name.trim()) {
    ElMessage.warning('请填写变量名称')
    return
  }
  if (bindingForm.type !== 'secret_text' && !bindingValueText.value.trim()) {
    ElMessage.warning('请填写变量值')
    return
  }
  if (bindingForm.type === 'json') {
    try {
      JSON.parse(bindingValueText.value)
    } catch {
      ElMessage.warning('JSON 格式不正确')
      return
    }
  }
  savingBindings.value = true
  try {
    const ctx = await buildRequestContext(account)
    const cfAccountId = account.cfAccountId
    if (!cfAccountId) {
      ElMessage.warning('账号未回填 Cloudflare 账号 ID，请先在「账号管理」拉取资源')
      return
    }
    const name = bindingForm.name.trim()
    const isSecret = bindingForm.type === 'secret_text'
    const old = bindings.value.find((b) => (b.binding ?? b.name) === name)

    // 密钥由独立的 /secrets 接口管理
    if (old?.type === 'secret_text' && !isSecret) {
      await workersApi.deleteWorkerSecret(ctx, cfAccountId, scriptName.value, name)
    }
    if (isSecret) {
      await workersApi.putWorkerSecret(ctx, cfAccountId, scriptName.value, name, bindingValueText.value.trim())
    }

    // 组装完整变量集合（secret 仅占位，明文不回传）
    const next = bindings.value.filter((b) => (b.binding ?? b.name) !== name)
    if (isSecret) {
      next.push({ name, type: 'secret_text' })
    } else if (bindingForm.type === 'json') {
      next.push({ name, type: 'json', text: bindingValueText.value.trim() })
    } else {
      next.push({ name, type: 'plain_text', text: bindingValueText.value.trim() })
    }
    const payload: { type: 'plain_text' | 'secret_text' | 'json'; name: string; text?: string; json?: string }[] =
      next.map((b) => {
        const t = (b.type ?? 'plain_text') as 'plain_text' | 'secret_text' | 'json'
        const bn = b.binding ?? b.name ?? ''
        if (t === 'secret_text') return { type: t, name: bn }
        if (t === 'json') return { type: t, name: bn, json: b.text ?? '' }
        return { type: 'plain_text', name: bn, text: b.text ?? '' }
      })

    await workersApi.updateWorkerBindings(ctx, cfAccountId, scriptName.value, payload)
    await loadBindings()
    bindingDialogVisible.value = false
    ElMessage.success('变量已保存')
    await logStore.write({
      module: 'workers',
      action: '更新环境变量',
      detail: `更新 Worker「${scriptName.value}」环境变量（共 ${payload.length} 个）`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    savingBindings.value = false
  }
}

async function loadBindings() {
  const account = await currentContext()
  if (!account || !scriptName.value) return
  bindingsLoading.value = true
  try {
    const ctx = await buildRequestContext(account)
    bindings.value = await workersApi.listWorkerBindings(ctx, account.cfAccountId ?? '', scriptName.value)
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    bindingsLoading.value = false
  }
}

async function removeBinding(variable: CfWorkerVariable) {
  const account = await currentContext()
  const name = variable.binding ?? variable.name
  if (!account || !scriptName.value || !name) return
  await ElMessageBox.confirm(`删除变量「${name}」？`, '删除变量', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    const cfAccountId = account.cfAccountId
    if (!cfAccountId) {
      ElMessage.warning('账号未回填 Cloudflare 账号 ID，请先在「账号管理」拉取资源')
      return
    }
    if (variable.type === 'secret_text') {
      try {
        await workersApi.deleteWorkerSecret(ctx, cfAccountId, scriptName.value, name)
      } catch {
        /* 忽略删除密钥失败 */
      }
    }
    const payload = buildBindingPayload().filter(
      (b) => b.name !== name
    )
    await workersApi.updateWorkerBindings(ctx, cfAccountId, scriptName.value, payload)
    await loadBindings()
    ElMessage.success('已删除')
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 自定义域名 ---------------- */
const domains = ref<CfWorkerDomain[]>([])
const domainsLoading = ref(false)
const domainsError = ref('')
const domainDialogVisible = ref(false)
const savingDomain = ref(false)
const domainForm = reactive({ hostname: '', zoneId: '' })

/** 主机名占位：首选 zone 名作为提示 */
const domainHostnamePlaceholder = computed(() => {
  const zone = accountZones.value.find((z) => z.id === domainForm.zoneId)
  return zone ? `例如 app.${zone.name}` : '例如 app.example.com'
})
/** 账号级 workers.dev 子域名 */
const workerSubdomain = ref('')
/** 该 Worker 的默认 Website：{script}.{subdomain}.workers.dev */
const workerWebsite = computed(() =>
  workerSubdomain.value && scriptName.value
    ? `https://${scriptName.value}.${workerSubdomain.value}.workers.dev`
    : ''
)

/** 标题区展示的自定义域名（去重，最多显示 5 个） */
const headDomains = computed(() => {
  const seen = new Set<string>()
  const rows: CfWorkerDomain[] = []
  for (const d of domains.value) {
    if (!d.hostname || seen.has(d.hostname)) continue
    seen.add(d.hostname)
    rows.push(d)
    if (rows.length >= 5) break
  }
  return rows
})

async function loadDomains() {
  const account = await currentContext()
  if (!account || !scriptName.value) return
  domainsLoading.value = true
  domainsError.value = ''
  try {
    const cfAccountId = account.cfAccountId
    if (!cfAccountId) {
      domainsError.value = '账号未绑定 Cloudflare 账号 ID，请先在「账号管理」执行「拉取资源」'
      return
    }
    const ctx = await buildRequestContext(account)
    domains.value = await workersApi.listWorkerDomains(ctx, cfAccountId, scriptName.value)
    // 读取账号的 workers.dev 子域名，用于展示默认 Website
    try {
      const info = await workersApi.getWorkerSubdomain(ctx, cfAccountId)
      workerSubdomain.value = info?.subdomain ?? ''
    } catch {
      workerSubdomain.value = ''
    }
  } catch (error) {
    domainsError.value = (error as Error).message
  } finally {
    domainsLoading.value = false
  }
}

function openDomainDialog() {
  domainForm.hostname = ''
  domainForm.zoneId = accountZones.value[0]?.id ?? ''
  if (!accountZones.value.length) {
    void resourceStore.loadZones(true).then(() => {
      domainForm.zoneId = domainForm.zoneId || (accountZones.value[0]?.id ?? '')
    })
  }
  domainDialogVisible.value = true
}

async function saveDomain() {
  const zone = resourceStore.zones.rows.find((z) => z.id === domainForm.zoneId)
  const zoneName = zone?.name ?? ''
  // 主机名需包含所选 zone（相同或以 .zone 结尾），未包含时自动补全
  let hostname = domainForm.hostname.trim()
  if (
    zoneName &&
    hostname &&
    hostname.toLowerCase() !== zoneName.toLowerCase() &&
    !hostname.toLowerCase().endsWith(`.${zoneName.toLowerCase()}`)
  ) {
    hostname = `${hostname}.${zoneName}`
  }
  if (!hostname) {
    ElMessage.warning('请填写主机名')
    return
  }
  const account = await currentContext()
  if (!account || !scriptName.value) return
  if (!account.cfAccountId) {
    ElMessage.warning('账号未回填 Cloudflare 账号 ID，请先在「账号管理」拉取资源')
    return
  }
  if (!domainForm.zoneId) {
    ElMessage.warning('请选择所属域名')
    return
  }
  savingDomain.value = true
  try {
    const ctx = await buildRequestContext(account)
    await workersApi.createWorkerDomain(ctx, account.cfAccountId, hostname, scriptName.value, domainForm.zoneId)
    domainDialogVisible.value = false
    await loadDomains()
    ElMessage.success(`域名 ${hostname} 已添加`)
    await logStore.write({
      module: 'workers',
      action: '新增自定义域名',
      detail: `为 Worker「${scriptName.value}」添加域名 ${hostname}`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    savingDomain.value = false
  }
}

async function removeDomain(domain: CfWorkerDomain) {
  const account = await currentContext()
  if (!account || !scriptName.value) return
  await ElMessageBox.confirm(`删除自定义域名「${domain.hostname}」？`, '删除域名', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    if (!account.cfAccountId) {
      ElMessage.warning('账号未回填 Cloudflare 账号 ID，请先在「账号管理」拉取资源')
      return
    }
    await workersApi.deleteWorkerDomain(ctx, account.cfAccountId, domain.id)
    await loadDomains()
    ElMessage.success('已删除')
    await logStore.write({
      module: 'workers',
      action: '删除自定义域名',
      detail: `删除 Worker「${scriptName.value}」域名 ${domain.hostname}`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 路由 ---------------- */
const routeDialogVisible = ref(false)
const savingRoute = ref(false)
const routeForm = reactive({ pattern: '', zoneId: '' })

const accountZones = computed(() =>
  resourceStore.zones.rows.filter(
    (z) =>
      (accountStore.resolveAccount(z.__accountId) ?? accountStore.resolveAccount(z.account?.id))?.id ===
      currentAccountId.value
  )
)

function zoneName(zoneId?: string): string {
  if (!zoneId) return '-'
  return resourceStore.zones.rows.find((z) => z.id === zoneId)?.name ?? zoneId
}

function openRouteDialog() {
  routeForm.pattern = ''
  routeForm.zoneId = accountZones.value[0]?.id ?? ''
  routeDialogVisible.value = true
}

async function saveRoute() {
  const account = await currentContext()
  if (!account || !scriptName.value) return
  if (!routeForm.zoneId) {
    ElMessage.warning('请选择域名')
    return
  }
  savingRoute.value = true
  try {
    const ctx = await buildRequestContext(account)
    await workersApi.createWorkerRoute(ctx, routeForm.zoneId, {
      pattern: routeForm.pattern.trim(),
      script: scriptName.value
    })
    routeDialogVisible.value = false
    await loadRoutes()
    ElMessage.success('路由已创建')
    await logStore.write({
      module: 'workers',
      action: '新增路由',
      detail: `为「${scriptName.value}」新增路由 ${routeForm.pattern.trim()}`,
      accountId: account.id,
      accountName: account.name
    })
  } catch (error) {
    ElMessage.error((error as Error).message)
  } finally {
    savingRoute.value = false
  }
}

async function loadRoutes() {
  const account = await currentContext()
  if (!account || !scriptName.value) return
  routesLoading.value = true
  routesError.value = ''
  try {
    const ctx = await buildRequestContext(account)
    // 路由为 zone 级资源，需逐 zone 拉取后合并
    const zones = resourceStore.zones.rows.filter(
      (z) =>
        (accountStore.resolveAccount(z.__accountId) ?? accountStore.resolveAccount(z.account?.id))?.id ===
        account.id
    )
    if (!zones.length) {
      routesError.value = '该账号暂无域名，无法读取路由'
    } else {
      const results = await runWithConcurrency(zones, 3, async (zone) => {
        const rows = await workersApi.listWorkerRoutes(ctx, zone.id)
        return rows.map((r) => ({ ...r, zone_id: zone.id, __zoneName: zone.name }))
      })
      const failures = results
        .filter((r) => r.status === 'rejected')
        .map((r) => (r as PromiseRejectedResult).reason as Error)
      if (failures.length) {
        routesError.value = failures.map((e) => e.message).join('；')
      }
      routes.value = results
        .filter((r) => r.status === 'fulfilled' && !!r.value)
        .flatMap((r) => (r as PromiseFulfilledResult<Array<CfWorkerRoute & { zone_id: string; __zoneName?: string }>>).value)
        .filter((r) => r.script === scriptName.value)
    }
  } catch (error) {
    routesError.value = (error as Error).message
  } finally {
    routesLoading.value = false
  }
}

async function unbindRoute(workerRoute: CfWorkerRoute) {
  const account = await currentContext()
  if (!account) return
  await ElMessageBox.confirm(`解绑路由「${workerRoute.pattern}」？`, '解绑路由', {
    type: 'warning',
    confirmButtonText: '解绑',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await workersApi.updateWorkerRoute(ctx, workerRoute.zone_id ?? '', workerRoute.id, { script: null })
    await loadRoutes()
    ElMessage.success('已解绑')
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

async function removeRoute(workerRoute: CfWorkerRoute) {
  const account = await currentContext()
  if (!account) return
  await ElMessageBox.confirm(`删除路由「${workerRoute.pattern}」？`, '删除路由', {
    type: 'warning',
    confirmButtonText: '删除',
    cancelButtonText: '取消'
  })
  try {
    const ctx = await buildRequestContext(account)
    await workersApi.deleteWorkerRoute(ctx, workerRoute.zone_id ?? '', workerRoute.id)
    await loadRoutes()
    ElMessage.success('已删除')
  } catch (error) {
    ElMessage.error((error as Error).message)
  }
}

/* ---------------- 工具 ---------------- */
function backToList() {
  router.push('/workers')
}

onMounted(async () => {
  await accountStore.load()
  if (!resourceStore.zones.loaded) {
    await resourceStore.loadZones()
  }
  if (!resourceStore.workers.loaded) {
    await resourceStore.loadWorkers()
  }
  await loadDomainsForList()
  if (scriptName.value) {
    await loadDetail()
  }
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.script-search {
  width: 260px;

  @include mobile {
    width: 100%;
  }
}

.script-table,
.vars-table,
.routes-table {
  @include card;
}

.script-name {
  color: var(--cp-primary);
  font-size: 13.5px;

  @include ellipsis(1);
}

.cp-link {
  color: var(--cp-primary);
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }

  @include ellipsis(1);
  max-width: 100%;
}

.website-link {
  display: inline-block;
  margin-bottom: 8px;
  font-size: 12.5px;
}

.deploy-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 6px 12px;
  border-radius: $radius-sm;
  font-size: 12.5px;

  &.is-running {
    background: var(--cp-primary-bg);
    color: var(--cp-primary);
  }

  &.is-success {
    background: var(--cp-success-bg, rgba(34, 197, 94, 0.1));
    color: var(--cp-success, #16a34a);
  }

  &.is-error {
    background: var(--cp-danger-bg, rgba(239, 68, 68, 0.1));
    color: var(--cp-danger, #dc2626);
  }

  &__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    flex: none;
  }

  .el-icon.is-loading {
    animation: rotating 1.2s linear infinite;
  }
}

.deploy-log {
  margin-top: 10px;
  @include card;

  &__title {
    padding: 8px 12px;
    font-size: 12.5px;
    font-weight: 600;
    border-bottom: 1px solid var(--cp-border-light);
  }

  &__row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border-bottom: 1px dashed var(--cp-border-light);

    &:last-child {
      border-bottom: none;
    }

    .cp-ellipsis {
      flex: 1;
      min-width: 0;
    }
  }
}

@keyframes rotating {
  from {
    transform: rotate(0);
  }
  to {
    transform: rotate(360deg);
  }
}

.worker-head {
  display: flex;
  align-items: center;
  gap: 10px;

  &__info {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex-wrap: wrap;
  }

  &__links {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    flex-wrap: wrap;
  }

  &__link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    max-width: 240px;
    border-radius: 999px;
    background: var(--cp-bg-sunken);
    color: var(--cp-primary);
    font-size: 12px;
    text-decoration: none;

    @include ellipsis(1);

    &:hover {
      text-decoration: underline;
    }
  }
}

.worker-tabs {
  margin-top: 12px;
}

.worker-tabs-m {
  margin-top: 10px;
  border-radius: $radius-sm;
  overflow: hidden;
  background: var(--cp-card-bg);
}

.tab-pad {
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.deploy-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0 10px;

  @include mobile {
    padding: 8px 12px;
  }
}
</style>
/**
 * 账号与分组状态管理（需求模块1）
 *
 * - 新增账号：API Token / 邮箱+Global Key，新增时校验连通性与权限
 * - 密钥 AES-256-GCM 加密存储，仅存密文
 * - 状态识别：正常 / 失效 / 权限不足 / 过期 / 未检测
 * - 分组：自定义分组、拖拽/批量移入、折叠展开、置顶、搜索
 * - 批量：检测存活、刷新资源、删除失效账号
 */
import { defineStore } from 'pinia'
import type {
  AccountAuthType,
  AccountCredential,
  AccountGroup,
  AccountStatus,
  CfPagesProject,
  CfWorkerScript,
  CloudflareAccount,
  EncryptedPayload
} from '@/types'
import {
  STORE,
  deleteAccountCache,
  deleteMany,
  getAllRecords,
  getRecord,
  putMany,
  putRecord
} from '@/utils/db'
import { encryptText, randomId } from '@/utils/crypto'
import * as accountApi from '@/api/account'
import type { TokenVerifyResult } from '@/api/account'
import * as zonesApi from '@/api/zones'
import * as workersApi from '@/api/workers'
import * as pagesApi from '@/api/pages'
import { CfApiError, type CfRequestContext } from '@/api/client'
import {
  buildRequestContext,
  cacheCredential,
  clearCredentialCache,
  resolveCredential
} from './credentialService'
import { useLogStore } from './useLogStore'
import { useBatchStore } from './useBatchStore'
import { runWithConcurrency } from '@/utils/scheduler'

/** 账号校验结果 */
export interface AccountVerifyResult {
  ok: boolean
  status: AccountStatus
  statusMessage?: string
  cfAccountId?: string
  cfUserId?: string
}

/** 新增账号输入 */
export interface AccountCreateInput {
  name: string
  authType: AccountAuthType
  token?: string
  email?: string
  globalKey?: string
  remark?: string
  tags?: string[]
  groupId: string
  pinned?: boolean
}

/** 账号分组（移动端拖拽排序目标） */
export interface GroupMoveTarget {
  id: string
  groupId: string
}

/** 尽力补充账号归属：/user 需要 "User Details Read" 权限，缺失时退回 /accounts */
async function resolveAccountScope(
  ctx: CfRequestContext
): Promise<{ accountId?: string; userId?: string }> {
  try {
    const user = await accountApi.verifyCredential(ctx)
    return { accountId: user.accounts?.[0]?.id, userId: user.id }
  } catch {
    try {
      const accounts = await accountApi.listUserAccounts(ctx)
      return { accountId: accounts[0]?.id }
    } catch {
      return {}
    }
  }
}

/** 鉴权失败的统一归类与提示 */
function classifyAuthFailure(error: unknown): AccountVerifyResult {
  if (error instanceof CfApiError) {
    const detail = error.message ? `（${error.message}）` : ''
    if (error.unauthorized) {
      return { ok: false, status: 'invalid', statusMessage: `凭据无效或已过期${detail}` }
    }
    if (error.forbidden) {
      return { ok: false, status: 'forbidden', statusMessage: `API Token 权限不足，请检查 Token 作用域${detail}` }
    }
    return { ok: false, status: 'invalid', statusMessage: error.friendlyMessage }
  }
  return { ok: false, status: 'invalid', statusMessage: (error as Error).message }
}

export const useAccountStore = defineStore('account', {
  state: () => ({
    accounts: [] as CloudflareAccount[],
    groups: [] as AccountGroup[],
    loaded: false,
    /** 正在刷新的账号 id 集合 */
    refreshing: {} as Record<string, boolean>,
    /** 正在校验的账号 id 集合 */
    checking: {} as Record<string, boolean>,
    lastSyncAt: 0 as number | null,
    loading: false
  }),

  getters: {
    total(state) {
      return state.accounts.length
    },
    activeCount(state) {
      return state.accounts.filter((a) => a.status === 'active').length
    },
    abnormalCount(state) {
      return state.accounts.filter(
        (a) => a.status !== 'active' && a.status !== 'unknown'
      ).length
    },
    zoneCount(state) {
      return state.accounts.reduce((sum, a) => sum + (a.stats?.zoneCount ?? 0), 0)
    },
    workerCount(state) {
      return state.accounts.reduce((sum, a) => sum + (a.stats?.workerCount ?? 0), 0)
    },
    pagesCount(state) {
      return state.accounts.reduce((sum, a) => sum + (a.stats?.pagesCount ?? 0), 0)
    },
    /** 有效账号列表（可用于批量任务的子集） */
    usableAccounts(state) {
      return state.accounts.filter(
        (a) =>
          a.status === 'active' || a.status === 'unknown' || !a.lastCheckedAt
      )
    },
    /** 按 sortOrder 排序的分组 */
    sortedGroups(state) {
      return [...state.groups].sort((a, b) => a.sortOrder - b.sortOrder)
    }
  },

  actions: {
    /** 按本地账号 id 或 Cloudflare account_id 查找账号（兼容历史脏数据） */
    resolveAccount(refId?: string) {
      if (!refId) return undefined
      return this.accounts.find((a) => a.id === refId || a.cfAccountId === refId)
    },

    /* ------------------------------------------------------------ */
    /* 加载与持久化                                                  */
    /* ------------------------------------------------------------ */

    async load() {
      if (this.loaded) return
      const [accounts, groups] = await Promise.all([
        getAllRecords<CloudflareAccount>(STORE.account),
        getAllRecords<AccountGroup>(STORE.group)
      ])
      this.accounts = accounts.sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt - a.createdAt)
      // 保证 "未分组" 群组存在
      if (!groups.some((g) => g.id === 'ungrouped')) {
        groups.push({
          id: 'ungrouped',
          name: '未分组',
          collapsed: false,
          sortOrder: 9999,
          createdAt: 0
        })
      }
      this.groups = groups.sort((a, b) => a.sortOrder - b.sortOrder)
      this.loaded = true
    },

    async persistAccount(account: CloudflareAccount) {
      await putRecord(STORE.account, account)
      const idx = this.accounts.findIndex((a) => a.id === account.id)
      if (idx >= 0) this.accounts[idx] = { ...account }
      else this.accounts.push(account)
    },

    /* ------------------------------------------------------------ */
    /* 鉴权校验                                                      */
    /* ------------------------------------------------------------ */

    /**
     * 校验凭据有效性，识别账号状态
     * - API Token：先用 /user/tokens/verify（任意有效 Token 均可访问，无需额外权限）判定有效性，
     *   再尽力补充账号归属；/user 需要 "User Details Read" 权限，常见 Token 模板未必包含，缺失时退回 /accounts
     * - Global Key：直接 /user（邮箱 + Key 即最高权限）
     * - 401/9109 -> invalid（失效）；403 -> forbidden（权限不足）；verify 返回 expires_on 早于当前 -> expired
     */
    async verifyCredential(
      account: CloudflareAccount
    ): Promise<AccountVerifyResult> {
      let ctx: CfRequestContext
      try {
        ctx = await buildRequestContext(account)
      } catch (error) {
        return { ok: false, status: 'invalid', statusMessage: (error as Error).message }
      }

      // 检查凭据是否为空
      const cred = ctx.credential
      if (cred.authType === 'token' && !cred.token) {
        return { ok: false, status: 'invalid', statusMessage: 'API Token 未配置' }
      }
      if (cred.authType === 'globalKey' && (!cred.email || !cred.globalKey)) {
        return { ok: false, status: 'invalid', statusMessage: '邮箱或 Global Key 未配置' }
      }

      // Global Key：/user 一次完成校验与账号归属
      if (account.authType === 'globalKey') {
        return this.verifyViaUser(ctx)
      }

      // API Token：先确认令牌有效性（无需 User Details 权限）
      let verify: TokenVerifyResult
      try {
        verify = await accountApi.verifyToken(ctx)
      } catch (error) {
        // verify 接口异常时退回 /user 判定
        return this.verifyViaUser(ctx)
      }
      if (verify?.expires_on && new Date(verify.expires_on).getTime() < Date.now()) {
        return { ok: false, status: 'expired', statusMessage: 'API Token 已过期' }
      }
      if (verify?.status && verify.status !== 'active') {
        return {
          ok: false,
          status: 'invalid',
          statusMessage: `API Token 状态异常：${verify.status}`
        }
      }

      // 令牌有效，补充账号归属（尽力而为，失败不影响有效性结论）
      const scope = await resolveAccountScope(ctx)
      return {
        ok: true,
        status: 'active',
        cfAccountId: scope.accountId,
        cfUserId: scope.userId
      }
    },

    /** 通过 /user 校验（Global Key 必用；Token 模式作兜底），并兼容旧版过期检测 */
    async verifyViaUser(ctx: CfRequestContext): Promise<AccountVerifyResult> {
      try {
        const user = await accountApi.verifyCredential(ctx)
        let status: AccountStatus = 'active'
        let statusMessage: string | undefined
        if (ctx.credential.authType === 'token') {
          try {
            const verify = await accountApi.verifyToken(ctx)
            if (verify?.expires_on && new Date(verify.expires_on).getTime() < Date.now()) {
              status = 'expired'
              statusMessage = 'API Token 已过期'
            }
          } catch {
            /* verify 异常忽略 */
          }
        }
        return {
          ok: true,
          status,
          statusMessage,
          cfAccountId: user.accounts?.[0]?.id,
          cfUserId: user.id
        }
      } catch (error) {
        return classifyAuthFailure(error)
      }
    },

    /** 新增账号（校验通过后才落库，密钥密文存储） */
    async addAccount(input: AccountCreateInput): Promise<{ ok: boolean; account?: CloudflareAccount; message?: string }> {
      const name = input.name?.trim()
      if (!name) return { ok: false, message: '请填写账号名称' }

      // 构建明文凭据并准备加密
      let plain: string
      let identity: string
      const credential: AccountCredential = { authType: input.authType }

      if (input.authType === 'token') {
        const token = input.token?.trim() ?? ''
        if (!token) return { ok: false, message: '请填写 API Token' }
        plain = token
        identity = token.slice(0, 6) + '****' + token.slice(-4)
        credential.token = token
      } else {
        const email = input.email?.trim() ?? ''
        const globalKey = input.globalKey?.trim() ?? ''
        if (!email || !globalKey) return { ok: false, message: '请填写邮箱与 Global API Key' }
        plain = JSON.stringify({ authType: 'globalKey', email, globalKey })
        identity = email
        credential.email = email
        credential.globalKey = globalKey
      }

      // 内存缓存明文，便于立即校验
      const tempAccountId = randomId('acc')
      cacheCredential(tempAccountId, credential)

      const tempAccount: CloudflareAccount = {
        id: tempAccountId,
        name,
        authType: input.authType,
        identity,
        remark: input.remark,
        tags: [...(input.tags ?? [])],
        groupId: input.groupId || 'ungrouped',
        pinned: input.pinned ?? false,
        status: 'unknown',
        credential: {} as EncryptedPayload,
        stats: { zoneCount: 0, workerCount: 0, pagesCount: 0 },
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sortOrder: Date.now()
      }

      // 校验连通性
      const result = await this.verifyCredential(tempAccount)
      if (!result.ok && result.status === 'invalid') {
        clearCredentialCache(tempAccountId)
        return { ok: false, message: `鉴权失败：${result.statusMessage}` }
      }

      // 加密持久化
      const encrypted = await encryptText(plain)
      // 用正式 id 替换临时 id（重新缓存）
      const account: CloudflareAccount = {
        ...tempAccount,
        id: randomId('acc'),
        credential: encrypted,
        status: result.status,
        statusMessage: result.statusMessage,
        cfAccountId: result.cfAccountId,
        cfUserId: result.cfUserId,
        lastCheckedAt: Date.now()
      }
      clearCredentialCache(tempAccountId)
      cacheCredential(account.id, credential)

      await this.persistAccount(account)
      await this.logOperation('account', '新增账号', `账号「${account.name}」鉴权成功，状态：${account.status}`)

      // 立即拉取首轮资源
      this.refreshAccount(account.id).catch(() => undefined)

      return { ok: true, account }
    },

    /** 更新账号基础信息（不含密钥） */
    async updateAccountMeta(accountId: string, patch: Partial<Pick<CloudflareAccount, 'name' | 'remark' | 'tags' | 'pinned' | 'sortOrder'>>) {
      const account = this.accounts.find((a) => a.id === accountId)
      if (!account) return
      const updated = { ...account, ...patch, updatedAt: Date.now() }
      await this.persistAccount(updated)
    },

    /** 更新账号（含凭据） */
    async updateAccount(accountId: string, input: Partial<AccountCreateInput>): Promise<{ ok: boolean; message?: string }> {
      const account = this.accounts.find((a) => a.id === accountId)
      if (!account) return { ok: false, message: '账号不存在' }

      const updated: CloudflareAccount = { ...account, updatedAt: Date.now() }

      if (input.name !== undefined) updated.name = input.name.trim()
      if (input.remark !== undefined) updated.remark = input.remark
      if (input.tags !== undefined) updated.tags = [...input.tags]
      if (input.groupId !== undefined) updated.groupId = input.groupId

      // 只有当凭据字段有实际值时才更新（空值表示不修改）
      const hasTokenInput = input.token && input.token.trim()
      const hasEmailInput = input.email && input.email.trim()
      const hasGlobalKeyInput = input.globalKey && input.globalKey.trim()
      const needUpdateCredential = hasTokenInput || hasEmailInput || hasGlobalKeyInput

      if (needUpdateCredential) {
        const authType = input.authType ?? account.authType
        let plain: string
        let identity: string
        const credential: AccountCredential = { authType }

        if (authType === 'token') {
          const token = input.token?.trim() ?? ''
          if (!token) return { ok: false, message: '请填写 API Token' }
          plain = token
          identity = token.slice(0, 6) + '****' + token.slice(-4)
          credential.token = token
        } else {
          const email = input.email?.trim() ?? ''
          const globalKey = input.globalKey?.trim() ?? ''
          if (!email || !globalKey) return { ok: false, message: '请填写邮箱与 Global API Key' }
          plain = JSON.stringify({ authType: 'globalKey', email, globalKey })
          identity = email
          credential.email = email
          credential.globalKey = globalKey
        }

        const encrypted = await encryptText(plain)
        updated.authType = authType
        updated.identity = identity
        updated.credential = encrypted
        clearCredentialCache(accountId)
        cacheCredential(accountId, credential)
      }

      await this.persistAccount(updated)
      return { ok: true }
    },

    /** 重新检测账号状态 */
    async recheckAccount(accountId: string) {
      const account = this.accounts.find((a) => a.id === accountId)
      if (!account) return
      if (this.checking[accountId]) return
      this.checking = { ...this.checking, [accountId]: true }
      try {
        const result = await this.verifyCredential(account)
        const updated = {
          ...account,
          status: result.status,
          statusMessage: result.statusMessage,
          cfAccountId: result.cfAccountId ?? account.cfAccountId,
          cfUserId: result.cfUserId ?? account.cfUserId,
          lastCheckedAt: Date.now()
        }
        await this.persistAccount(updated)
        await this.logOperation(
          'account',
          '检测账号',
          result.ok ? `账号「${account.name}」状态正常` : `账号「${account.name}」异常：${result.statusMessage}`,
          result.ok ? 'success' : 'warning',
          accountId,
          result.ok ? 'success' : 'fail'
        )
        return result
      } finally {
        this.checking = { ...this.checking, [accountId]: false }
      }
    },

    /** 校验单个账号（不落库，用于表单新增前的提示） */
    async testCredential(input: {
      authType: AccountAuthType
      token?: string
      email?: string
      globalKey?: string
    }): Promise<AccountVerifyResult> {
      const tempId = randomId('acc_test')
      const credential: AccountCredential = { authType: input.authType }
      if (input.authType === 'token') credential.token = input.token
      else {
        credential.email = input.email
        credential.globalKey = input.globalKey
      }
      cacheCredential(tempId, credential)
      try {
        return await this.verifyCredential({ id: tempId } as CloudflareAccount)
      } finally {
        clearCredentialCache(tempId)
      }
    },

    /* ------------------------------------------------------------ */
    /* 删除                                                          */
    /* ------------------------------------------------------------ */

    async removeAccount(accountId: string) {
      const account = this.accounts.find((a) => a.id === accountId)
      const db = await import('@/utils/db')
      await db.deleteRecord(STORE.account, accountId)
      await deleteAccountCache(accountId)
      this.accounts = this.accounts.filter((a) => a.id !== accountId)
      clearCredentialCache(accountId)
      // 级联清理该账号的域名 / DNS / Workers / Pages / WAF（内存 + 本地缓存）
      const { useResourceStore } = await import('@/store/useResourceStore')
      await useResourceStore().clearAccountRows(accountId)
      await this.logOperation(
        'account',
        '删除账号',
        `删除账号「${account?.name ?? accountId}」及其本地缓存与关联资源数据`,
        'warning'
      )
    },

    /** 口令重置/主密钥重建后，清除全部已加密凭据并标记需重新配置 */
    async invalidateCredentials(message = '主密钥已重置，请重新配置 API 凭据') {
      let changed = false
      for (const acc of this.accounts) {
        if (acc.credential?.cipher) {
          acc.credential = { cipher: '', iv: '', alg: 'AES-GCM', kv: 1 }
          changed = true
        }
        if (acc.status !== 'invalid') {
          acc.status = 'invalid'
          acc.statusMessage = message
          changed = true
        }
      }
      if (changed) {
        await putMany(STORE.account, this.accounts)
      }
      clearCredentialCache()
      await this.logOperation('account', '口令重置', message, 'warning')
    },

    /** 删除全部失效/异常账号 */
    async removeInvalidAccounts() {
      const invalid = this.accounts.filter((a) => a.status !== 'active' && a.status !== 'unknown')
      if (!invalid.length) return { removed: 0 }
      await deleteMany(
        STORE.account,
        invalid.map((a) => a.id)
      )
      for (const a of invalid) await deleteAccountCache(a.id)
      this.accounts = this.accounts.filter((a) => a.status === 'active' || a.status === 'unknown')
      invalid.forEach((a) => clearCredentialCache(a.id))
      // 级联清理这些账号的域名 / DNS / Workers / Pages / WAF
      const { useResourceStore } = await import('@/store/useResourceStore')
      const resourceStore = useResourceStore()
      for (const a of invalid) await resourceStore.clearAccountRows(a.id)
      await this.logOperation(
        'account',
        '批量删除异常账号',
        `批量删除 ${invalid.length} 个失效/异常账号并清理其关联资源数据`,
        'warning'
      )
      return { removed: invalid.length }
    },

    /* ------------------------------------------------------------ */
    /* 资源同步                                                      */
    /* ------------------------------------------------------------ */

    async refreshAccount(
      accountId: string,
      options: { skipCache?: boolean } = {}
    ): Promise<{ zones: number; workers: number; pages: number } | null> {
      const account = this.accounts.find((a) => a.id === accountId)
      if (!account) return null
      if (this.refreshing[accountId]) return null
      this.refreshing = { ...this.refreshing, [accountId]: true }
      try {
        const ctx = await buildRequestContext(account)

        // 先拉取域名列表：zone 自带 account 归属，可用于回填 cfAccountId
        // （Token 无 "User Details" 权限时 /user、/accounts 拿不到账号归属，只能从 zones 回填）
        const zones = await zonesApi.listZones(ctx)
        const cfAccountId = account.cfAccountId ?? zones[0]?.account?.id

        // 无 cfAccountId 时跳过 Workers/Pages，避免请求形如 /accounts//workers 的无效地址
        const [workers, pages] = cfAccountId
          ? await Promise.all([
              workersApi.listWorkerScripts(ctx, cfAccountId).catch(() => [] as CfWorkerScript[]),
              pagesApi.listPagesProjects(ctx, cfAccountId).catch(() => [] as CfPagesProject[])
            ])
          : ([[] as CfWorkerScript[], [] as CfPagesProject[]] as const)

        // 本地缓存与资源聚合一律以本账号 id 为键（与 loadZones/loadDns 读取方式一致）
        const db = await import('@/utils/db')
        await Promise.all([
          db.writeCache(account.id, 'zone', 'all', zones),
          db.writeCache(account.id, 'worker', 'all', workers),
          db.writeCache(account.id, 'pages', 'all', pages)
        ])

        const updated: CloudflareAccount = {
          ...account,
          cfAccountId: cfAccountId ?? account.cfAccountId,
          stats: {
            zoneCount: zones.length,
            workerCount: workers.length,
            pagesCount: pages.length
          },
          lastSyncAt: Date.now(),
          updatedAt: Date.now()
        }
        await this.persistAccount(updated)

        // 同步资源缓存到资源 store（__accountId 指向本账号 id）
        const { useResourceStore } = await import('@/store/useResourceStore')
        const resStore = useResourceStore()
        resStore._restoreFromAccount(account.id, updated, zones, workers, pages)

        await this.logOperation(
          'account',
          '刷新资源',
          `账号「${account.name}」同步完成：域名 ${zones.length}、Workers ${workers.length}、Pages ${pages.length}`,
          'success',
          accountId
        )
        return { zones: zones.length, workers: workers.length, pages: pages.length }
      } catch (error) {
        await this.logOperation(
          'account',
          '刷新资源',
          `账号「${account.name}」同步失败：${(error as Error).message}`,
          'error',
          accountId
        )
        return null
      } finally {
        this.refreshing = { ...this.refreshing, [accountId]: false }
      }
    },

    /** 同步某账号资源统计（轻量，供资源 store 复用，避免重复拉取） */
    async updateStats(accountId: string, patch: { zoneCount?: number; workerCount?: number; pagesCount?: number }) {
      const account = this.accounts.find((a) => a.id === accountId)
      if (!account) return
      const updated = {
        ...account,
        stats: { ...account.stats, ...patch },
        lastSyncAt: Date.now(),
        updatedAt: Date.now()
      }
      await this.persistAccount(updated)
    },

    /** 一键刷新全部账号（并发受限） */
    async refreshAll(): Promise<{ success: string[]; failed: string[] }> {
      const ids = this.accounts.map((a) => a.id)
      const success: string[] = []
      const failed: string[] = []
      this.loading = true
      try {
        const results = await runWithConcurrency(ids, 4, async (id) => {
          const account = this.accounts.find((a) => a.id === id)
          const result = await this.refreshAccount(id)
          return { name: account?.name || id, ok: result !== null }
        })
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value.ok) {
            success.push(r.value.name)
          } else {
            const reason = r.status === 'rejected' ? r.reason : null
            const name = (r as PromiseFulfilledResult<{ name: string; ok: boolean }>).value?.name || '未知账号'
            failed.push(name)
          }
        }
        this.lastSyncAt = Date.now()
      } finally {
        this.loading = false
      }
      return { success, failed }
    },

    /* ------------------------------------------------------------ */
    /* 批量检测                                                      */
    /* ------------------------------------------------------------ */

    async checkAll() {
      const batchStore = useBatchStore()
      const task = batchStore.createTask({
        type: 'account-check',
        title: `批量检测账号（${this.accounts.length}）`,
        items: this.accounts.map((a) => ({
          accountId: a.id,
          accountName: a.name,
          target: '状态检测',
          success: false,
          finishedAt: 0
        })),
        dangerous: false,
        payload: {}
      })
      batchStore.runTask(task.id, async (item, emit) => {
        const account = this.accounts.find((a) => a.id === item.accountId)
        if (!account) {
          emit({ success: false, message: '账号不存在' })
          return
        }
        const result = await this.recheckAccount(account.id)
        emit(
          result?.ok
            ? { success: true, message: `状态：${result.status}` }
            : { success: false, message: result?.statusMessage ?? '检测失败' }
        )
      })
    },

    /* ------------------------------------------------------------ */
    /* 分组                                                          */
    /* ------------------------------------------------------------ */

    async addGroup(name: string): Promise<AccountGroup> {
      const group: AccountGroup = {
        id: randomId('grp'),
        name: name?.trim() || '新分组',
        collapsed: false,
        sortOrder: this.groups.length ? Math.max(...this.groups.map((g) => g.sortOrder)) + 1 : 1,
        createdAt: Date.now()
      }
      await putRecord(STORE.group, group)
      this.groups = [...this.groups, group].sort((a, b) => a.sortOrder - b.sortOrder)
      return group
    },

    async renameGroup(groupId: string, name: string) {
      const group = this.groups.find((g) => g.id === groupId)
      if (!group) return
      const updated = { ...group, name: name.trim() || group.name }
      await putRecord(STORE.group, updated)
      this.groups = this.groups.map((g) => (g.id === groupId ? updated : g))
    },

    async toggleGroupCollapsed(groupId: string) {
      const group = this.groups.find((g) => g.id === groupId)
      if (!group) return
      const updated = { ...group, collapsed: !group.collapsed }
      await putRecord(STORE.group, updated)
      this.groups = this.groups.map((g) => (g.id === groupId ? updated : g))
    },

    async removeGroup(groupId: string) {
      if (groupId === 'ungrouped') return
      const db = await import('@/utils/db')
      await db.deleteRecord(STORE.group, groupId)
      // 组内账号移入未分组
      const moved = this.accounts.filter((a) => a.groupId === groupId)
      if (moved.length) {
        await Promise.all(moved.map((a) => this.moveAccountToGroup(a.id, 'ungrouped')))
      }
      this.groups = this.groups.filter((g) => g.id !== groupId)
    },

    /** 移动账号到指定分组（支持单/批量） */
    async moveAccountToGroup(accountIds: string | string[], groupId: string) {
      const ids = Array.isArray(accountIds) ? accountIds : [accountIds]
      await Promise.all(
        ids.map(async (id) => {
          const account = this.accounts.find((a) => a.id === id)
          if (!account) return
          await this.persistAccount({ ...account, groupId, updatedAt: Date.now() })
        })
      )
    },

    async moveGroup(up: boolean) {
      // 分组整体上移/下移由列表组件调 sortGroupOrder 替代
      void up
    },

    /* ------------------------------------------------------------ */
    /* 工具                                                          */
    /* ------------------------------------------------------------ */

    async logOperation(
      module: string,
      action: string,
      detail: string,
      level: 'info' | 'success' | 'warning' | 'error' = 'success',
      accountId?: string,
      result?: 'success' | 'fail'
    ) {
      const logStore = useLogStore()
      const account = accountId ? this.accounts.find((a) => a.id === accountId) : undefined
      await logStore.write({
        module,
        action,
        detail,
        level,
        result: result ?? (level === 'error' ? 'fail' : 'success'),
        accountId,
        accountName: account?.name
      })
    }
  }
})
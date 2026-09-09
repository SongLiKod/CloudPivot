/**
 * Cloudflare Pages 接口（技术文档 §4.5）
 */
import { cfResult, CF_API_BASE, type CfRequestContext } from './client'
import type { CfPagesDeployment, CfPagesDomain, CfPagesProject } from '@/types'
/** 项目列表：GET /accounts/{account_id}/pages/projects（Pages 接口不接受 per_page/page，需不带分页参数） */
export function listPagesProjects(
  ctx: CfRequestContext,
  accountId: string
): Promise<CfPagesProject[]> {
  return cfResult<CfPagesProject[]>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/pages/projects`
  })
}

/** 项目详情：GET /accounts/{account_id}/pages/projects/{project_name} */
export function getPagesProject(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string
): Promise<CfPagesProject> {
  return cfResult<CfPagesProject>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`
  })
}

/** 创建项目：POST /accounts/{account_id}/pages/projects */
export function createPagesProject(
  ctx: CfRequestContext,
  accountId: string,
  payload: {
    name: string
    production_branch?: string
    build_config?: {
      build_command?: string | null
      destination_dir?: string | null
      root_dir?: string | null
    }
    deployment_configs?: Record<
      string,
      { env_variables?: Record<string, { value: string; type?: string }> }
    >
    source?: { type: string; config?: Record<string, unknown> }
  }
): Promise<CfPagesProject> {
  return cfResult<CfPagesProject>(ctx, {
    method: 'POST',
    url: `/accounts/${accountId}/pages/projects`,
    data: payload
  })
}

/** 修改项目配置：PATCH /accounts/{account_id}/pages/projects/{project_name} */
export function updatePagesProject(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string,
  payload: Partial<{
    production_branch: string
    build_config: {
      build_command?: string | null
      destination_dir?: string | null
      root_dir?: string | null
    }
    deployment_configs: Record<
      string,
      { env_variables?: Record<string, { value: string; type?: string }> }
    >
    source: { type: string; config?: Record<string, unknown> }
  }>
): Promise<CfPagesProject> {
  return cfResult<CfPagesProject>(ctx, {
    method: 'PATCH',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`,
    data: payload
  })
}

/** 删除项目：DELETE /accounts/{account_id}/pages/projects/{project_name} */
export function deletePagesProject(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string
): Promise<unknown> {
  return cfResult<unknown>(ctx, {
    method: 'DELETE',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}`
  })
}

/** 部署列表：GET /accounts/{account_id}/pages/projects/{project_name}/deployments（不带分页参数） */
export function listPagesDeployments(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string
): Promise<CfPagesDeployment[]> {
  return cfResult<CfPagesDeployment[]>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`
  })
}

/** 触发构建：POST /accounts/{account_id}/pages/projects/{project_name}/deployments */
export function triggerPagesDeployment(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string
): Promise<CfPagesDeployment> {
  return cfResult<CfPagesDeployment>(ctx, {
    method: 'POST',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`,
    data: {}
  })
}

/** 部署详情 / 日志：GET /accounts/{account_id}/pages/projects/{project_name}/deployments/{deployment_id} */
export function getPagesDeployment(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string,
  deploymentId: string
): Promise<CfPagesDeployment> {
  return cfResult<CfPagesDeployment>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(
      projectName
    )}/deployments/${deploymentId}`
  })
}

/** 部署日志（C3 结构化日志接口）：GET .../deployments/{deployment_id}/history/logs */
export function getDeploymentLogs(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string,
  deploymentId: string
): Promise<{ data?: Array<{ line: string; ts?: string }>; total?: number; includes_container_logs?: boolean }> {
  return cfResult<{ data?: Array<{ line: string; ts?: string }>; total?: number; includes_container_logs?: boolean }>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(
      projectName
    )}/deployments/${deploymentId}/history/logs`,
    params: { size: 500 },
    timeout: 40_000
  })
}

/** 回滚到指定部署：POST .../deployments/{deployment_id}/retry */
export function retryPagesDeployment(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string,
  deploymentId: string
): Promise<CfPagesDeployment> {
  return cfResult<CfPagesDeployment>(ctx, {
    method: 'POST',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(
      projectName
    )}/deployments/${deploymentId}/retry`,
    data: {}
  })
}

/* ------------------------------------------------------------------ */
/* 自定义域名（Custom Domains）                                        */
/* ------------------------------------------------------------------ */

/** 自定义域名列表：GET /accounts/{account_id}/pages/projects/{project_name}/domains（Pages 接口不接受 per_page/page，需不带分页参数） */
export function listPagesDomains(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string
): Promise<CfPagesDomain[]> {
  return cfResult<CfPagesDomain[]>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/domains`
  })
}

/** 添加自定义域名（Pages 域名接口仅支持 POST，zone 归属由 Cloudflare 自动判定）：POST .../domains */
export function createPagesDomain(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string,
  name: string
): Promise<CfPagesDomain> {
  return cfResult<CfPagesDomain>(ctx, {
    method: 'POST',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/domains`,
    data: { name }
  })
}

/** 删除自定义域名：DELETE .../domains/{domain_name} */
export function deletePagesDomain(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string,
  domainName: string
): Promise<unknown> {
  return cfResult<unknown>(ctx, {
    method: 'DELETE',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(
      projectName
    )}/domains/${encodeURIComponent(domainName)}`
  })
}

/* ------------------------------------------------------------------ */
/* 直接上传（无 Git 仓库）                                             */
/* ------------------------------------------------------------------ */

/** 获取上传令牌：GET /accounts/{account_id}/pages/projects/{project}/upload-token */
export async function getPagesUploadToken(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string
): Promise<{ jwt: string }> {
  return cfResult<{ jwt: string }>(ctx, {
    method: 'GET',
    url: `/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/upload-token`
  })
}

/**
 * 上传文件资产到 Pages 资产服务：POST /pages/assets/upload
 * 鉴权使用上传令牌 JWT（非 API Token），需绕过常规 axios 拦截器
 */
export async function uploadPagesAssets(
  jwt: string,
  entries: Array<{ key: string; value: string; metadata: { contentType: string }; base64: boolean }>
): Promise<void> {
  const res = await fetch(`${CF_API_BASE}/pages/assets/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${jwt}`
    },
    body: JSON.stringify(entries)
  })
  if (!res.ok) {
    throw new Error(`文件资产上传失败（HTTP ${res.status}）`)
  }
}

/** 直接上传创建部署：POST /accounts/{account_id}/pages/projects/{project}/deployments（multipart manifest） */
export async function createDirectUploadDeployment(
  ctx: CfRequestContext,
  accountId: string,
  projectName: string,
  manifest: Record<string, string>,
  branch?: string
): Promise<CfPagesDeployment> {
  // 用 fetch + FormData 发送，避免 axios 对 multipart 的 Content-Type/boundary 处理问题
  const form = new FormData()
  form.append('manifest', JSON.stringify(manifest))
  if (branch) form.append('branch', branch)

  const headers: Record<string, string> = {}
  const cred = ctx.credential
  if (cred.authType === 'token') headers.Authorization = `Bearer ${cred.token}`
  else {
    headers['X-Auth-Email'] = cred.email ?? ''
    headers['X-Auth-Key'] = cred.globalKey ?? ''
  }

  const res = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/pages/projects/${encodeURIComponent(projectName)}/deployments`,
    { method: 'POST', headers, body: form }
  )
  const body = (await res.json().catch(() => null)) as {
    result?: CfPagesDeployment
    errors?: Array<{ message?: string }>
  } | null
  if (!res.ok) {
    const msg =
      body?.errors?.length
        ? body.errors.map((e) => e.message ?? '').filter(Boolean).join('；')
        : `创建部署失败（HTTP ${res.status}）`
    throw new Error(msg)
  }
  return body?.result as CfPagesDeployment
}
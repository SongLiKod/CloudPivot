/**
 * 版本检查与更新服务
 * - Electron: 使用 electron-updater（主进程处理）
 * - Android: 检查 GitHub Release，下载 APK 并调用系统安装
 * - Web: 仅检查版本，提示用户刷新
 */

import { isElectron, isAndroid } from '@/utils/platform'

export interface ReleaseInfo {
  version: string
  publishedAt: string
  releaseNotes: string
  downloadUrl: string
  assets: {
    name: string
    url: string
    size: number
  }[]
}

export interface UpdateStatus {
  checking: boolean
  available: boolean
  downloading: boolean
  downloaded: boolean
  error: string | null
  version: string | null
  progress: number
}

const GITHUB_REPO = 'SongLiKod/CloudPivot'
const GITHUB_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

/**
 * 比较版本号
 * @returns -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number)
  const pb = b.replace(/^v/, '').split('.').map(Number)

  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na < nb) return -1
    if (na > nb) return 1
  }
  return 0
}

/**
 * 从 GitHub 获取最新版本信息
 */
export async function fetchLatestRelease(): Promise<{
  success: boolean
  release?: ReleaseInfo
  error?: string
}> {
  try {
    const response = await fetch(GITHUB_API, {
      headers: {
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'CloudPivot-Update-Checker'
      }
    })

    if (!response.ok) {
      if (response.status === 403) {
        return { success: false, error: 'GitHub API 请求频率限制，请稍后重试' }
      }
      return { success: false, error: `检查更新失败: HTTP ${response.status}` }
    }

    const data = await response.json()
    const version = data.tag_name?.replace(/^v/, '')

    if (!version) {
      return { success: false, error: '无法解析版本信息' }
    }

    return {
      success: true,
      release: {
        version,
        publishedAt: data.published_at,
        releaseNotes: data.body || '无更新说明',
        downloadUrl: data.html_url,
        assets: (data.assets || []).map((asset: { name: string; browser_download_url: string; size: number }) => ({
          name: asset.name,
          url: asset.browser_download_url,
          size: asset.size
        }))
      }
    }
  } catch (err) {
    return { success: false, error: `检查更新失败: ${(err as Error).message}` }
  }
}

/**
 * 检查是否有新版本（通用）
 */
export async function checkForUpdate(): Promise<{
  hasUpdate: boolean
  release?: ReleaseInfo
  error?: string
}> {
  // Electron: 使用 electron-updater
  if (isElectron && window.cloudpivot?.update) {
    const result = await window.cloudpivot.update.check()
    if (!result.success) {
      return { hasUpdate: false, error: result.error }
    }
    const status = await window.cloudpivot.update.getStatus()
    return {
      hasUpdate: status.available,
      release: status.version ? { version: status.version } as ReleaseInfo : undefined
    }
  }

  // Android / Web: 直接调用 GitHub API
  const result = await fetchLatestRelease()
  if (!result.success || !result.release) {
    return { hasUpdate: false, error: result.error }
  }

  const currentVersion = __APP_VERSION__
  const hasUpdate = compareVersions(currentVersion, result.release.version) < 0

  return { hasUpdate, release: result.release }
}

/**
 * 下载更新（Android 专用）
 */
export async function downloadUpdate(release: ReleaseInfo, onProgress?: (progress: number) => void): Promise<{
  success: boolean
  blob?: Blob
  error?: string
}> {
  if (!isAndroid) {
    return { success: false, error: '仅 Android 支持下载更新' }
  }

  // 查找 APK 文件
  const apkAsset = release.assets.find(a => a.name.endsWith('.apk'))
  if (!apkAsset) {
    return { success: false, error: '未找到 APK 文件' }
  }

  try {
    const response = await fetch(apkAsset.url)
    if (!response.ok) {
      return { success: false, error: `下载失败: HTTP ${response.status}` }
    }

    const contentLength = response.headers.get('content-length')
    const total = contentLength ? parseInt(contentLength, 10) : apkAsset.size
    let loaded = 0

    const reader = response.body?.getReader()
    if (!reader) {
      return { success: false, error: '无法读取响应流' }
    }

    const chunks: Uint8Array[] = []
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(value)
      loaded += value.length
      onProgress?.(Math.round((loaded / total) * 100))
    }

    const blob = new Blob(chunks as BlobPart[], { type: 'application/vnd.android.package-archive' })
    return { success: true, blob }
  } catch (err) {
    return { success: false, error: `下载失败: ${(err as Error).message}` }
  }
}

/**
 * 安装更新（Android 专用）
 */
export async function installUpdate(blob: Blob): Promise<{ success: boolean; error?: string }> {
  if (!isAndroid) {
    return { success: false, error: '仅 Android 支持安装更新' }
  }

  try {
    // 使用 Capacitor Filesystem 保存文件
    const { Filesystem, Directory } = await import('@capacitor/filesystem')
    const arrayBuffer = await blob.arrayBuffer()
    const base64Data = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )

    const fileName = `cloudpivot-update.apk`
    await Filesystem.writeFile({
      path: fileName,
      data: base64Data,
      directory: Directory.Cache
    })

    // 获取文件 URI
    const { Capacitor } = await import('@capacitor/core')
    const uriResult = await Filesystem.getUri({ path: fileName, directory: Directory.Cache })
    const nativePath = Capacitor.convertFileSrc(uriResult.uri)

    // 使用 Web Intent 调用系统安装
    // 注意：实际项目中建议使用 @capacitor/app-launcher 或原生插件
    const installUrl = `intent://install#${encodeURIComponent(JSON.stringify({ url: nativePath }))}`
    window.open(installUrl, '_blank')

    return { success: true }
  } catch (err) {
    return { success: false, error: `安装失败: ${(err as Error).message}` }
  }
}

/**
 * 获取适合当前平台的下载链接
 */
export function getDownloadUrlForPlatform(release: ReleaseInfo, platform: 'electron' | 'android'): string | null {
  if (platform === 'electron') {
    const exeAsset = release.assets.find(a => a.name.endsWith('.exe'))
    return exeAsset?.url || null
  }

  if (platform === 'android') {
    const apkAsset = release.assets.find(a => a.name.endsWith('.apk'))
    return apkAsset?.url || null
  }

  return null
}

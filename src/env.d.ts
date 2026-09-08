/// <reference types="vite/client" />
/// <reference types="element-plus/global" />

declare const __APP_VERSION__: string

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<Record<string, unknown>, Record<string, unknown>, unknown>
  export default component
}

declare module 'xlsx'
declare module 'jspdf-autotable'

/** Vant 4 全局组件类型增强（独立模块文件 vue-global.d.ts 中声明），避免污染 vue 解析 */

/** Electron 主进程通过 preload 暴露的桥接接口 */
interface CloudPivotDesktopBridge {
  /** 平台标识 */
  platform: 'electron'
  /** 窗口控制 */
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
    hideToTray: () => void
  }
  /** 文件读写：备份导出 / Excel 导入 */
  fs: {
    saveFile: (opts: {
      defaultPath?: string
      content: string
      filters?: { name: string; extensions: string[] }[]
    }) => Promise<string | null>
    openFile: (opts: {
      filters?: { name: string; extensions: string[] }[]
    }) => Promise<{ path: string; content: string } | null>
    pickDirectory: () => Promise<string | null>
    readFileBuffer: (path: string) => Promise<ArrayBuffer | null>
    writeFileBuffer: (path: string, data: ArrayBuffer) => Promise<boolean>
    exists: (path: string) => Promise<boolean>
  }
  /** 系统信息 */
  system: {
    getInfo: () => Promise<{ versions: Record<string, string>; paths: Record<string, string> }>
  }
  /** 邮件发送（主进程发起，规避 CORS） */
  email: {
    send: (opts: {
      serviceId: string
      templateId: string
      publicKey: string
      params: Record<string, string>
    }) => Promise<boolean>
  }
  /** 自动更新 */
  update: {
    check: () => Promise<{ success: boolean; error?: string }>
    download: () => Promise<{ success: boolean; error?: string }>
    install: () => Promise<void>
    getStatus: () => Promise<UpdateStatus>
    onStatusChange: (callback: (status: UpdateStatus) => void) => void
  }
  /** 主题：通知主进程同步原生窗口外观 */
  setNativeTheme: (theme: 'light' | 'dark') => void
}

interface UpdateStatus {
  checking: boolean
  available: boolean
  downloading: boolean
  downloaded: boolean
  error: string | null
  version: string | null
  progress: number
}

interface Window {
  cloudpivot?: CloudPivotDesktopBridge
}
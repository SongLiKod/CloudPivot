/**
 * 平台与形态探测
 * - Windows 桌面：Capacitor-Electron 打包，走 Element Plus
 * - Android 移动端：Capacitor-Android 打包，走 Vant4
 * - 浏览器开发环境：按视口宽度自动降级，便于调试双端形态
 */
import { Capacitor } from '@capacitor/core'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export type PlatformKind = 'electron' | 'android' | 'web'

const MOBILE_BREAKPOINT = 768

/** 是否为 Electron 桌面壳（由 preload 注入 window.cloudpivot 判定） */
export const isElectron = typeof window !== 'undefined' && !!window.cloudpivot

/** Capacitor 原生平台标识 */
const nativePlatform = Capacitor.getPlatform() as string

export const platformKind: PlatformKind = isElectron
  ? 'electron'
  : nativePlatform === 'android'
    ? 'android'
    : 'web'

/** 原生 Android 端 */
export const isAndroid = platformKind === 'android'

/** 视口宽度（响应式） */
export const viewportWidth = ref(typeof window !== 'undefined' ? window.innerWidth : 1280)

let listenerAttached = false
function handleResize() {
  viewportWidth.value = window.innerWidth
}

/** 启动视口监听（在 App 挂载时调用一次） */
export function initViewportWatch() {
  if (listenerAttached || typeof window === 'undefined') return
  window.addEventListener('resize', handleResize)
  window.addEventListener('orientationchange', handleResize)
  listenerAttached = true
}

export function destroyViewportWatch() {
  if (!listenerAttached || typeof window === 'undefined') return
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('orientationchange', handleResize)
  listenerAttached = false
}

/**
 * 是否使用移动端形态：原生 Android，或视口 <= 768px
 * 用于在同一套页面代码中切换 Element Plus / Vant 组件
 */
export const isMobile = computed(
  () => platformKind === 'android' || viewportWidth.value <= MOBILE_BREAKPOINT
)

export const isDesktop = computed(() => !isMobile.value)

/** 横竖屏（Android 自适应） */
export const isLandscape = computed(() => viewportWidth.value >= 720)

/** 组合式：随组件生命周期自动监听视口变化 */
export function usePlatform() {
  onMounted(initViewportWatch)
  onBeforeUnmount(() => {
    // 视口监听为全局单例，组件卸载不销毁，避免频繁增删
  })
  return { platformKind, isElectron, isAndroid, isMobile, isDesktop, isLandscape, viewportWidth }
}

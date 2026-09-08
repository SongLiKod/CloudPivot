/**
 * 平台与形态探测
 *
 * 已移除 Electron / Capacitor 外壳，改由 Flutter(WebView) 承载：
 * - Flutter 客户端内即为普通 Web 形态（无原生桥），按视口宽度自动切换桌面/移动端布局
 * - 桌面（Windows WebView2）与移动（Android WebView）共用同一套响应式代码
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

export type PlatformKind = 'web' | 'electron' | 'android'

const MOBILE_BREAKPOINT = 768

/** 应用运行形态：WebView 内一律视为 Web */
export const platformKind: PlatformKind = 'web'

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
 * 是否使用移动端形态：视口 <= 768px
 * 用于在同一套页面代码中切换 Element Plus / Vant 组件
 */
export const isMobile = computed(() => viewportWidth.value <= MOBILE_BREAKPOINT)

export const isDesktop = computed(() => !isMobile.value)

/** 横竖屏（Android 自适应） */
export const isLandscape = computed(() => viewportWidth.value >= 720)

/** 组合式：随组件生命周期自动监听视口变化 */
export function usePlatform() {
  onMounted(initViewportWatch)
  onBeforeUnmount(() => {
    // 视口监听为全局单例，组件卸载不销毁，避免频繁增删
  })
  return { platformKind, isMobile, isDesktop, isLandscape, viewportWidth }
}
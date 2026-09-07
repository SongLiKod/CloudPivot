/**
 * 路由加载提示状态：懒加载 chunk / 页面未就绪期间给出可见反馈
 *
 * - 导航开始即显示顶部进度条
 * - 超过 OVERLAY_DELAY 仍未完成 -> 切换为全屏「页面加载中」遮罩，避免误判已加载完成
 * - 遮罩最长停留 OVERLAY_MAX，随后降级为进度条，防止网络挂起时一直阻塞操作
 */
import { reactive } from 'vue'

const OVERLAY_DELAY = 800
const OVERLAY_MAX = 12_000

export const routeLoadingState = reactive({
  active: false,
  overlay: false
})

let overlayTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined

export function startRouteLoading() {
  clearTimeout(overlayTimer)
  clearTimeout(hideTimer)
  routeLoadingState.active = true
  routeLoadingState.overlay = false
  overlayTimer = setTimeout(() => {
    if (routeLoadingState.active) routeLoadingState.overlay = true
  }, OVERLAY_DELAY)
  hideTimer = setTimeout(() => {
    routeLoadingState.overlay = false
  }, OVERLAY_DELAY + OVERLAY_MAX)
}

export function stopRouteLoading() {
  clearTimeout(overlayTimer)
  clearTimeout(hideTimer)
  routeLoadingState.active = false
  routeLoadingState.overlay = false
}

<template>
  <div>
    <div v-if="state.active" class="route-bar" />
    <div v-if="state.overlay" class="route-mask">
      <div class="route-mask__box">
        <el-icon class="route-mask__spinner" :size="26"><Loading /></el-icon>
        <span class="route-mask__text">页面加载中…</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { routeLoadingState } from '@/utils/routerLoading'

const state = routeLoadingState
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.route-bar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  overflow: hidden;
  z-index: 3000;
  pointer-events: none;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: -40%;
    width: 40%;
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, transparent, var(--cp-primary), transparent);
    animation: route-slide 1.1s ease-in-out infinite;
  }
}

.route-mask {
  position: fixed;
  inset: 0;
  z-index: 2600;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--cp-bg-mask);
  -webkit-backdrop-filter: blur(2px);
  backdrop-filter: blur(2px);

  &__box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 22px 30px;
    border-radius: $radius-lg;
    background: var(--cp-bg-elevated);
    box-shadow: var(--cp-shadow);
  }

  &__spinner {
    color: var(--cp-primary);
    animation: route-spin 0.9s linear infinite;
  }

  &__text {
    font-size: 13px;
    color: var(--cp-text-secondary);
  }
}

@keyframes route-slide {
  to {
    left: 100%;
  }
}

@keyframes route-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>

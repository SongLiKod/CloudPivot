<template>
  <div class="app-layout" :class="{ 'is-mobile': isMobile, 'is-collapsed': collapsed }">
    <!-- 桌面侧边栏 -->
    <aside v-if="isDesktop" class="sidebar">
      <div class="sidebar__brand cp-titlebar-drag">
        <div class="sidebar__logo">云枢</div>
        <span v-if="!collapsed" class="sidebar__name">CloudPivot</span>
      </div>

      <nav class="sidebar__nav">
        <router-link
          v-for="item in desktopNav"
          :key="item.path"
          :to="item.path"
          class="sidebar__item"
          :class="{ 'is-active': isActive(item.path) }"
          :title="item.title"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span v-if="!collapsed" class="sidebar__label">{{ item.title }}</span>
          <span v-if="item.path === '/batch'" class="sidebar__badge" :class="{ 'is-run': batchRunning > 0 }">
            {{ batchRunning }}
          </span>
        </router-link>
      </nav>

      <div class="sidebar__footer">
        <router-link to="/settings" class="sidebar__item" :class="{ 'is-active': isActive('/settings') }">
          <el-icon :size="18"><Setting /></el-icon>
          <span v-if="!collapsed" class="sidebar__label">设置</span>
        </router-link>
        <div class="sidebar__collapse cp-titlebar-nodrag" @click="collapsed = !collapsed">
          <el-icon :size="16">
            <Expand v-if="collapsed" />
            <Fold v-else />
          </el-icon>
          <span v-if="!collapsed" class="sidebar__label">收起菜单</span>
        </div>
      </div>
    </aside>

    <!-- 主内容区 -->
    <div class="main">
      <!-- 桌面顶栏 -->
      <header v-if="isDesktop" class="main__header cp-titlebar-drag">
        <div class="main__header-left">
          <h1 class="main__title">{{ currentTitle }}</h1>
        </div>
        <div class="main__header-right cp-titlebar-nodrag">
          <div class="sync-status" :class="{ 'is-loading': accountStore.loading }" @click="onRefreshAll">
            <el-icon :size="15" class="cp-titlebar-nodrag">
              <RefreshRight v-if="!accountStore.loading" />
              <Loading v-else />
            </el-icon>
            <span>{{ accountStore.lastSyncAt ? `最近同步 ${formatRelative(accountStore.lastSyncAt)}` : '同步资源' }}</span>
          </div>
          <el-tooltip content="批量任务" placement="bottom">
            <div class="icon-btn" @click="$router.push('/batch')">
              <el-icon :size="16"><Operation /></el-icon>
              <span v-if="batchRunning" class="icon-btn__dot"></span>
            </div>
          </el-tooltip>
          <el-tooltip content="日志审计" placement="bottom">
            <div class="icon-btn" @click="$router.push('/logs')">
              <el-icon :size="16"><Document /></el-icon>
            </div>
          </el-tooltip>
        </div>
      </header>

      <!-- 移动端顶栏 -->
      <header v-if="isMobile" class="main__header main__header--mobile">
        <div class="mobile-title">{{ currentTitle }}</div>
        <div class="main__header-right">
          <div class="icon-btn" @click="onRefreshAll">
            <el-icon :size="18"><RefreshRight /></el-icon>
          </div>
        </div>
      </header>

      <!-- 内容 -->
      <main class="main__content">
        <router-view v-slot="{ Component, route }">
          <transition name="cp-fade" mode="out-in">
            <component :is="Component" :key="route.path" />
          </transition>
        </router-view>
      </main>

      <!-- 移动端底部导航 -->
      <nav v-if="isMobile" class="mobile-tabbar cp-safe-bottom">
        <router-link
          v-for="item in mobileTabs"
          :key="item.path"
          :to="item.path"
          class="mobile-tabbar__item"
          :class="{ 'is-active': isActive(item.path) }"
        >
          <el-icon :size="20"><component :is="item.icon" /></el-icon>
          <span class="mobile-tabbar__label">{{ item.title }}</span>
        </router-link>
      </nav>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { Fold, Expand } from '@element-plus/icons-vue'
import { NAV_ITEMS } from '@/router'
import { useAccountStore } from '@/store/useAccountStore'
import { useBatchStore } from '@/store/useBatchStore'
import { usePlatform } from '@/utils/platform'
import { formatRelative } from '@/utils/format'

const route = useRoute()
const { isMobile, isDesktop } = usePlatform()
const collapsed = ref(false)

const accountStore = useAccountStore()
const batchStore = useBatchStore()

const desktopNav = computed(() =>
  NAV_ITEMS.filter((item) => item.desktop && item.path !== '/settings')
)
const mobileTabs = computed(() => NAV_ITEMS.filter((item) => item.mobileTab))

const batchRunning = computed(() => batchStore.totalRunning)

const currentTitle = computed(() => {
  const meta = route.meta.title as string | undefined
  return meta ?? '云枢 CloudPivot'
})

function isActive(path: string): boolean {
  if (path === '/') return route.path === '/'
  return route.path === path || route.path.startsWith(`${path}/`)
}

async function onRefreshAll() {
  if (accountStore.loading) return
  await accountStore.refreshAll()
}

onMounted(() => {
  // 移动端默认不折叠
})
</script>

<style scoped lang="scss">
@use '@/assets/styles/variables' as *;

.app-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

/* ---- 桌面侧边栏 ---- */
.sidebar {
  width: $sidebar-width;
  flex: none;
  display: flex;
  flex-direction: column;
  background: var(--cp-bg-card);
  border-right: 1px solid var(--cp-border);
  transition: width 0.2s ease;

  .app-layout.is-collapsed & {
    width: $sidebar-width-collapsed;
  }

  &__brand {
    display: flex;
    align-items: center;
    gap: 10px;
    height: $header-height;
    padding: 0 16px;
    flex: none;
    border-bottom: 1px solid var(--cp-border-light);
  }

  &__logo {
    width: 34px;
    height: 34px;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 9px;
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: #fff;
    font-weight: 700;
    font-size: 13px;
  }

  &__name {
    font-weight: 700;
    font-size: 15px;
    color: var(--cp-text-primary);
    letter-spacing: 0.5px;
  }

  &__nav {
    flex: 1;
    padding: 10px 8px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__item {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 40px;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--cp-text-secondary);
    text-decoration: none;
    font-size: 13.5px;
    transition: all 0.15s ease;
    position: relative;

    &:hover {
      background: var(--cp-bg-hover);
      color: var(--cp-text-primary);
    }

    &.is-active {
      background: var(--cp-primary-bg);
      color: var(--cp-primary);
      font-weight: 600;
    }

    .app-layout.is-collapsed & {
      justify-content: center;
      padding: 0;
    }
  }

  &__label {
    @include ellipsis(1);
    flex: 1;
  }

  &__badge {
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: var(--cp-bg-sunken);
    color: var(--cp-text-secondary);
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;

    &.is-run {
      background: var(--cp-primary);
      color: #fff;
      animation: pulse 1.2s ease infinite;
    }
  }

  &__footer {
    border-top: 1px solid var(--cp-border-light);
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  &__collapse {
    display: flex;
    align-items: center;
    gap: 10px;
    height: 36px;
    padding: 0 12px;
    border-radius: 8px;
    color: var(--cp-text-secondary);
    font-size: 12.5px;
    cursor: pointer;

    &:hover {
      background: var(--cp-bg-hover);
      color: var(--cp-text-primary);
    }
  }
}

/* ---- 主区 ---- */
.main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--cp-bg-page);

  &__header {
    height: $header-height;
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    border-bottom: 1px solid var(--cp-border-light);
    background: var(--cp-bg-elevated);
    z-index: 9;
  }

  &__header--mobile {
    padding: 0 12px;
    padding-top: env(safe-area-inset-top, 0);
    position: sticky;
    top: 0;
  }

  &__title {
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  &__header-right {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  &__content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }
}

.mobile-title {
  font-size: 15px;
  font-weight: 600;
}

.sync-status {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 8px;
  color: var(--cp-text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    background: var(--cp-bg-hover);
    color: var(--cp-text-primary);
  }

  &.is-loading .el-icon {
    animation: spin 1s linear infinite;
  }
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--cp-text-secondary);
  position: relative;

  &:hover {
    background: var(--cp-bg-hover);
    color: var(--cp-text-primary);
  }

  &__dot {
    position: absolute;
    top: 6px;
    right: 6px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--cp-danger);
  }
}

/* ---- 移动端底部导航 ---- */
.mobile-tabbar {
  flex: none;
  height: $mobile-tabbar-height;
  display: flex;
  border-top: 1px solid var(--cp-border-light);
  background: var(--cp-bg-elevated);

  &__item {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--cp-text-secondary);
    text-decoration: none;
    min-height: $mobile-touch-min;

    &.is-active {
      color: var(--cp-primary);
    }
  }

  &__label {
    font-size: 11px;
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.55;
  }
}
</style>
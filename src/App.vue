<template>
  <div class="app-shell">
    <router-view />
    <AppLock v-if="locked" />
    <RouteLoading />
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import AppLock from '@/components/AppLock.vue'
import RouteLoading from '@/components/RouteLoading.vue'
import { lockState } from '@/utils/lockService'

const locked = computed(() => lockState.locked)
</script>

<style scoped lang="scss">
.app-shell {
  height: 100%;
}
</style>
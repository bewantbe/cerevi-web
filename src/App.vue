<template>
  <div id="app">
    <ViewerHeader />
    <main class="main-content">
      <router-view v-slot="{ Component, route }">
        <component :is="Component" :key="(route.params.specimenId as string) ?? route.path" />
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import ViewerHeader from './components/layout/ViewerHeader.vue'
import { useTheme } from './composables/useTheme'
import { useVISoRStore } from './stores/visor'

const visorStore = useVISoRStore()
useTheme()

onMounted(() => {
  // Initialize the application
  visorStore.initialize()
})
</script>

<style>
#app {
  font-family: var(--font-sans);
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
  color: var(--c-text);
}

.main-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>

<template>
  <div id="app">
    <Header />
    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import Header from './components/layout/Header.vue'
import { useVISoRStore } from './stores/visor'

const visorStore = useVISoRStore()

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
  overflow: hidden;
}
</style>

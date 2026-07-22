<template>
  <div id="app">
    <router-link v-if="route.name !== 'specimen'" to="/" class="home-brand" aria-label="Cerevi home">
      <svg class="brand-icon" viewBox="0 0 16 16" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
        <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
        <circle cx="8" cy="8" r="2" />
      </svg>
      <span>Cerevi</span>
    </router-link>
    <main class="main-content">
      <router-view v-slot="{ Component, route }">
        <component :is="Component" :key="(route.params.specimenId as string) ?? route.path" />
      </router-view>
    </main>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useTheme } from './composables/useTheme'
import { useVISoRStore } from './stores/visor'

const route = useRoute()
const visorStore = useVISoRStore()
useTheme()

onMounted(() => {
  // Initialize the application
  visorStore.initialize()
})
</script>

<style>
#app {
  font-family: var(--galavi-font-mono);
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--app-bg);
  color: var(--galavi-text);
}

.main-content {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow-y: auto;
  overflow-x: hidden;
}

.home-brand {
  position: fixed;
  top: 12px;
  left: clamp(18px, 3vw, 48px);
  z-index: 1000;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--galavi-text);
  font-family: var(--galavi-font-mono);
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-decoration: none;
  text-transform: uppercase;
  white-space: nowrap;
}
.home-brand .brand-icon {
  color: var(--galavi-accent);
  filter: drop-shadow(0 0 8px var(--galavi-accent-soft));
}
html.home-hero-active .home-brand {
  opacity: 0;
  pointer-events: none;
}
</style>

<template>
  <div id="app">
    <header class="global-header">
      <router-link to="/" class="home-brand" aria-label="Cerevi home">
        <svg class="brand-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">
          <path d="M2 12s3.7-7 10-7 10 7 10 7-3.7 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3.2" />
          <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2" />
        </svg>
        <span>Cerevi</span>
      </router-link>
      <SpecimenDropdown v-if="route.name === 'specimen'" />
    </header>
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
import { useCereviStore } from './stores/visor'
import SpecimenDropdown from './components/header/SpecimenDropdown.vue'

const visorStore = useCereviStore()
const route = useRoute()
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

.global-header {
  position: fixed;
  top: 0;
  right: 0;
  left: 0;
  /* Fits inside the viewer's --edge top margin (30px, fallback outside a shell). */
  height: var(--edge, 30px);
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 var(--edge, 30px);
  background: linear-gradient(180deg, rgba(4, 9, 13, 0.56), transparent);
  pointer-events: none;
}

.home-brand {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--galavi-text);
  font-family: var(--galavi-font-mono);
  font-size: 14px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.22em;
  text-decoration: none;
  text-transform: uppercase;
  white-space: nowrap;
  pointer-events: auto;
}
.home-brand .brand-icon {
  width: 18px;
  height: 18px;
  color: var(--galavi-accent);
  filter: drop-shadow(0 0 8px var(--galavi-accent-soft));
}
</style>

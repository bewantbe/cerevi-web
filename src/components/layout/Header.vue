<template>
  <header class="app-header">
    <div class="header-content">
      <!-- Logo and title -->
      <div class="header-left">
        <router-link to="/" class="logo-section">
          <el-icon class="logo-icon" size="28">
            <View />
          </el-icon>
          <h1 class="app-title">VISoR Platform</h1>
        </router-link>
      </div>

      <!-- Navigation -->
      <nav class="header-nav">
        <el-menu
          mode="horizontal"
          :default-active="currentRoute"
          class="nav-menu"
          @select="handleMenuSelect"
        >
          <el-menu-item index="/">
            <el-icon><House /></el-icon>
            <span>Home</span>
          </el-menu-item>
          <el-menu-item index="/about">
            <el-icon><InfoFilled /></el-icon>
            <span>About</span>
          </el-menu-item>
        </el-menu>
      </nav>

      <!-- Controls and status -->
      <div class="header-right">
        <!-- Specimen selector -->
        <div v-if="visorStore.specimens.length > 0" class="specimen-selector">
          <el-select
            :model-value="visorStore.currentSpecimen?.id"
            placeholder="Select specimen"
            size="small"
            style="width: 200px"
            @change="handleSpecimenChange"
          >
            <el-option
              v-for="specimen in visorStore.specimens"
              :key="specimen.id"
              :label="specimen.name"
              :value="specimen.id"
            >
              <div class="specimen-option">
                <span class="specimen-name">{{ specimen.name }}</span>
                <span class="specimen-species">{{ specimen.species }}</span>
              </div>
            </el-option>
          </el-select>
        </div>

        <!-- Language toggle -->
        <div class="seg-toggle" role="group" aria-label="Language">
          <button
            type="button"
            class="seg-btn"
            :class="{ active: currentLanguage === 'en' }"
            @click="setLanguage('en')"
          >EN</button>
          <button
            type="button"
            class="seg-btn"
            :class="{ active: currentLanguage === 'zh' }"
            @click="setLanguage('zh')"
          >中文</button>
        </div>

        <!-- Theme toggle -->
        <button
          type="button"
          class="icon-btn"
          :title="theme === 'dark' ? 'Switch to light' : 'Switch to dark'"
          :aria-label="theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="toggleTheme"
        >
          <el-icon :size="16">
            <Sunny v-if="theme === 'dark'" />
            <Moon v-else />
          </el-icon>
        </button>

        <!-- Loading indicator -->
        <div v-if="visorStore.loading" class="loading-indicator">
          <el-icon class="is-loading">
            <Loading />
          </el-icon>
        </div>

        <!-- Error indicator -->
        <el-popover
          v-if="visorStore.error"
          placement="bottom"
          trigger="click"
          width="300"
        >
          <template #reference>
            <el-button type="danger" size="small" :icon="WarningFilled" circle />
          </template>
          <div class="error-popup">
            <h4>Error</h4>
            <p>{{ visorStore.error }}</p>
            <el-button size="small" @click="visorStore.clearError">
              Dismiss
            </el-button>
          </div>
        </el-popover>
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVISoRStore } from '@/stores/visor'
import { useI18n } from '@/composables/useI18n'
import {
  View,
  House,
  InfoFilled,
  Loading,
  WarningFilled,
  Sunny,
  Moon
} from '@element-plus/icons-vue'
import { useTheme } from '@/composables/useTheme'

const route = useRoute()
const router = useRouter()
const visorStore = useVISoRStore()
const { locale: currentLanguage, setLocale } = useI18n()
const { theme, toggleTheme } = useTheme()

// Computed
const currentRoute = computed(() => {
  return route.path
})

// Methods
function handleMenuSelect(index: string) {
  if (index !== route.path) {
    router.push(index)
  }
}

async function handleSpecimenChange(specimenId: string) {
  if (specimenId && specimenId !== visorStore.currentSpecimen?.id) {
    // Navigate to viewer if not already there
    if (route.name !== 'atlas-viewer') {
      await router.push(`/viewer/${specimenId}`)
    } else {
      // Update current specimen
      await visorStore.setCurrentSpecimen(specimenId)
    }
  }
}

function setLanguage(lang: 'en' | 'zh') {
  setLocale(lang)
}
</script>

<style scoped>
.app-header {
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  position: sticky;
  top: 0;
  z-index: 1000;
}

.header-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  max-width: 1400px;
  margin: 0 auto;
  gap: 16px;
}

.header-left {
  display: flex;
  align-items: center;
}

.logo-section {
  display: flex;
  align-items: center;
  text-decoration: none;
  color: var(--c-text-strong);
  gap: 10px;
}

.logo-icon {
  color: var(--c-accent);
}

.app-title {
  font-size: 17px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--c-text-strong);
  margin: 0;
}

.header-nav {
  flex: 1;
  display: flex;
  justify-content: center;
}

.nav-menu {
  --el-menu-bg-color: transparent;
  --el-menu-hover-bg-color: transparent;
  --el-menu-text-color: var(--c-text-muted);
  --el-menu-active-color: var(--c-text-strong);
  --el-menu-border-color: transparent;
  border-bottom: none;
  background: transparent;
}

.nav-menu :deep(.el-menu-item) {
  height: 56px;
  line-height: 56px;
  font-size: 14px;
  color: var(--c-text-muted);
  border-bottom: 1px solid transparent;
  background: transparent !important;
}

.nav-menu :deep(.el-menu-item:hover),
.nav-menu :deep(.el-menu-item.is-active) {
  color: var(--c-text-strong);
  background: transparent !important;
  border-bottom-color: var(--c-accent);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.specimen-selector :deep(.el-select__wrapper) {
  background: var(--c-bg-elev);
  box-shadow: 0 0 0 1px var(--c-border) inset;
}

.specimen-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.specimen-name {
  font-weight: 500;
  color: var(--c-text-strong);
}

.specimen-species {
  font-size: 12px;
  color: var(--c-text-muted);
}

/* Segmented language toggle */
.seg-toggle {
  display: inline-flex;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  background: var(--c-bg-elev);
  overflow: hidden;
}

.seg-btn {
  appearance: none;
  background: transparent;
  border: 0;
  color: var(--c-text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 5px 10px;
  cursor: pointer;
}

.seg-btn + .seg-btn {
  border-left: 1px solid var(--c-border);
}

.seg-btn:hover {
  color: var(--c-text-strong);
}

.seg-btn.active {
  background: var(--c-accent-soft);
  color: var(--c-text-strong);
}

/* Round icon button (theme toggle, etc.) */
.icon-btn {
  appearance: none;
  border: 1px solid var(--c-border);
  background: var(--c-bg-elev);
  color: var(--c-text);
  width: 30px;
  height: 30px;
  border-radius: var(--radius-md);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}

.icon-btn:hover {
  color: var(--c-text-strong);
  border-color: var(--c-border-strong);
  background: var(--c-bg-soft);
}

.loading-indicator {
  display: flex;
  align-items: center;
  color: var(--c-accent);
}

.error-popup h4 {
  margin: 0 0 8px 0;
  color: var(--c-danger);
}

.error-popup p {
  margin: 0 0 16px 0;
  color: var(--c-text);
  line-height: 1.5;
}

/* Responsive design */
@media (max-width: 768px) {
  .header-content {
    padding: 0 16px;
    height: auto;
    flex-direction: column;
    gap: 12px;
    padding-top: 12px;
    padding-bottom: 12px;
  }

  .header-nav {
    order: 3;
    width: 100%;
    justify-content: center;
  }

  .header-right {
    order: 2;
    justify-content: space-between;
    width: 100%;
  }

  .app-title {
    font-size: 16px;
  }

  .specimen-selector {
    min-width: 150px;
  }
}

@media (max-width: 480px) {
  .app-title {
    display: none;
  }

  .header-right {
    flex-direction: column;
    gap: 8px;
  }

  .specimen-selector {
    width: 100%;
    min-width: auto;
  }
}
</style>

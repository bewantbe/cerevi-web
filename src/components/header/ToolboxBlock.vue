<template>
  <HudBlock v-if="store.mode !== 'grid'" label="Tools" placement="br" :fold-priority="4">
    <div class="toolbox">
      <button
        type="button"
        class="gear-button"
        :class="{ open, active: anyToolEnabled }"
        :aria-expanded="open"
        title="Toolbox"
        aria-label="Toggle toolbox"
        @click="open = !open"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="2.3" />
          <path d="M8 1.6v1.9M8 12.5v1.9M1.6 8h1.9M12.5 8h1.9M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M12.5 3.5l-1.3 1.3M4.8 11.2l-1.3 1.3" />
        </svg>
      </button>

      <div v-if="open" class="tool-list" role="toolbar" aria-label="Viewer tools">
        <button type="button" :class="{ active: store.isToolEnabled('ruler') }" title="Ruler" aria-label="Ruler" @click="store.toggleTool('ruler')">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
            <path d="M2.5 13.5 13.5 2.5" />
            <path d="M5.6 12.4l-1.7 1.7M8.6 9.4l-1.7 1.7M11.6 6.4l-1.7 1.7" />
          </svg>
        </button>
        <button type="button" :class="{ active: store.isToolEnabled('crosshair') }" :disabled="!store.isToolAvailable('crosshair')" title="Crosshair" aria-label="Crosshair" @click="store.toggleTool('crosshair')">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
            <path d="M8 2v12M2 8h12" />
          </svg>
        </button>
        <button type="button" :class="{ active: store.isToolEnabled('magnifier') }" :disabled="!store.isToolAvailable('magnifier')" title="Magnifier" aria-label="Magnifier" @click="store.toggleTool('magnifier')">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3.5 3.5" />
          </svg>
        </button>
        <button type="button" :class="{ active: store.isToolEnabled('selector') }" :disabled="!store.isToolAvailable('selector')" title="Selector" aria-label="Selector" @click="store.toggleTool('selector')">
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
            <path d="M2 5.5V2h3.5M10.5 2H14v3.5M14 10.5V14h-3.5M5.5 14H2v-3.5" />
          </svg>
        </button>
      </div>
    </div>
  </HudBlock>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { TOOL_NAMES, useVISoRStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'

const store = useVISoRStore()
const open = ref(false)
const anyToolEnabled = computed(() => TOOL_NAMES.some((tool) => store.isToolEnabled(tool)))
</script>

<style scoped>
.toolbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gear-button {
  display: inline-flex;
  width: 30px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid var(--galavi-border);
  border-radius: 2px;
  background: transparent;
  color: var(--galavi-text-dim);
  cursor: pointer;
}
.gear-button svg { transition: transform 0.25s ease; }
.gear-button:hover { color: var(--galavi-text); }
.gear-button.open svg { transform: rotate(90deg); }
.gear-button.active {
  border-color: var(--galavi-accent);
  color: var(--galavi-accent);
}

.tool-list {
  display: flex;
  align-items: center;
  gap: 4px;
}

.tool-list button {
  display: inline-flex;
  width: 30px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--galavi-text-dim);
  cursor: pointer;
}
.tool-list button:hover:not(:disabled) { color: var(--galavi-text); }
.tool-list button.active {
  border-color: var(--galavi-accent);
  background: var(--galavi-accent-soft);
  color: var(--galavi-accent);
  box-shadow: 0 0 8px var(--galavi-accent-soft);
}
.tool-list button:disabled {
  opacity: 0.34;
  cursor: not-allowed;
}
</style>

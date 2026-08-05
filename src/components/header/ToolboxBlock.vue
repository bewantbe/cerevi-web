<template>
  <HudBlock
    v-if="store.mode === 'quadrant' || store.mode === 'slice'"
    label="Toolbox"
    side="right"
    position="second"
    :default-open="false"
    :state-key="store.mode"
    :show-header="false"
    toggle-on-hover
  >
    <template #tab="{ open }">
      <svg class="gear-icon" :class="{ open, active: anyToolEnabled }" viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true">
        <g>
          <path d="M11 1h2v4h-2zM11 19h2v4h-2z" />
          <path d="M11 1h2v4h-2zM11 19h2v4h-2z" transform="rotate(45 12 12)" />
          <path d="M11 1h2v4h-2zM11 19h2v4h-2z" transform="rotate(90 12 12)" />
          <path d="M11 1h2v4h-2zM11 19h2v4h-2z" transform="rotate(135 12 12)" />
        </g>
        <circle cx="12" cy="12" r="6.7" />
        <circle cx="12" cy="12" r="2.4" />
      </svg>
    </template>
    <div class="toolbox">
      <div class="tool-list" role="toolbar" aria-label="Viewer tools">
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
        <button
          type="button"
          :class="{ active: store.magnifierMode }"
          :disabled="!store.isToolAvailable('magnifier')"
          :title="magnifierTitle"
          :aria-label="magnifierTitle"
          :aria-pressed="store.magnifierMode !== null"
          @click="store.cycleMagnifierMode()"
        >
          <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
            <circle cx="7" cy="7" r="4" />
            <path d="M10 10l3.5 3.5" />
            <text v-if="store.magnifierMode === '3d'" x="5.5" y="9" font-size="5" fill="currentColor" stroke="none">3</text>
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
import { computed } from 'vue'
import { TOOL_NAMES, useCereviStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'

const store = useCereviStore()
const anyToolEnabled = computed(() => TOOL_NAMES.some((tool) => store.isToolEnabled(tool)))
const magnifierTitle = computed(() => store.magnifierMode === null
  ? 'Enable 2D Magnifier'
  : store.magnifierMode === '2d'
    ? '2D Magnifier — click for 3D'
    : '3D Magnifier — click to disable')
</script>

<style scoped>
.toolbox {
  display: flex;
  align-items: center;
  gap: 8px;
}

.gear-icon {
  transition: transform 240ms ease;
}
.gear-icon.open { transform: rotate(45deg); }
.gear-icon.active {
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

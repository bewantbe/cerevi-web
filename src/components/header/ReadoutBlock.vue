<template>
  <aside
    v-if="store.mode !== 'grid'"
    class="readout-block"
    :class="`mode-${store.mode}`"
    aria-label="Viewer readout"
  >
    <div class="readout-rows">
      <div class="readout-row">
        <span class="readout-label">{{ cursorLabel }}</span>
        <span class="readout-value">{{ cursorPosition }}</span>
      </div>
      <div class="readout-row">
        <span class="readout-label">{{ centerLabel }}</span>
        <span class="readout-value">{{ centerPosition }}</span>
      </div>
      <div class="readout-row">
        <span class="readout-label">{{ resolutionLabel }}</span>
        <span class="readout-value">{{ store.resolutionReadout }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Vec3 } from 'galavi'
import { useCereviStore } from '@/stores/visor'
import { useTypewriter } from '@/composables/useTypewriter'

const store = useCereviStore()
const { display: cursorLabel } = useTypewriter('CURSOR POS', { interval: 34 })
const { display: centerLabel } = useTypewriter('CENTER POS', { interval: 39 })
const { display: resolutionLabel } = useTypewriter('RESOLUTION', { interval: 44 })

function formatPosition(position: Vec3 | null): string {
  return position ? position.map((value) => value.toFixed(1)).join(', ') : '—'
}

const cursorPosition = computed(() => formatPosition(store.cursorPosition))
const centerPosition = computed(() => formatPosition(store.centerPosition))
</script>

<style scoped>
.readout-block {
  position: absolute;
  z-index: 95;
  box-sizing: border-box;
  width: max-content;
  height: var(--readout-panel-height, 76px);
  min-width: var(--left-panel-width, 290px);
  max-width: calc(100vw - 2 * var(--edge, 30px));
  padding: 10px 12px;
  border: 1px solid var(--galavi-border);
  background:
    linear-gradient(135deg, var(--galavi-accent-soft), transparent 38%),
    var(--galavi-panel-bg);
  backdrop-filter: blur(18px) saturate(130%);
  box-shadow: 0 0 18px var(--galavi-accent-soft);
  clip-path: polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px));
  pointer-events: none;
}
/* Volume and Slice share a lower HUD baseline above the slider band. */
.readout-block.mode-volume {
  top: auto;
  bottom: var(--lower-panel-baseline, calc(var(--edge, 30px) + 76px));
  left: var(--edge, 30px);
}
/* Quadrant: over the bottom-left of the top-left 3D cell (2×2 grid inside the
   --edge-inset viewer frame, so the cell's left edge starts at --edge). */
.readout-block.mode-quadrant { top: auto; bottom: calc(50% + 12px); left: calc(var(--edge, 30px) + 12px); }
.readout-block.mode-slice {
  top: auto;
  bottom: var(--lower-panel-baseline, calc(var(--edge, 30px) + 76px));
  left: var(--edge, 30px);
}

.readout-rows {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.readout-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}
.readout-label {
  flex: 0 0 auto;
  color: var(--galavi-text-dim);
  font-size: 10px;
  letter-spacing: 0.14em;
  white-space: nowrap;
}
.readout-value {
  color: var(--galavi-text);
  font-family: var(--galavi-font-mono);
  font-size: var(--galavi-font-size);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>

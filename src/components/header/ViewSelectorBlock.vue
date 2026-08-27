<template>
  <HudBlock
    v-if="store.mode === 'grid'"
    label="View"
    side="right"
    position="second"
    :default-open="false"
    :state-key="store.mode"
    :show-header="false"
    toggle-on-hover
  >
    <template #tab>
      <span class="plane-symbol" aria-hidden="true">{{ activeView.symbol }}</span>
    </template>
    <div class="view-selector" role="radiogroup" aria-label="Grid orientation">
      <button
        v-for="view in views"
        :key="view.plane"
        type="button"
        :class="{ active: store.plane === view.plane }"
        :aria-checked="store.plane === view.plane"
        role="radio"
        @click="store.setPlane(view.plane)"
      >
        <span>{{ view.symbol }}</span>
        {{ view.label }}
      </button>
    </div>
  </HudBlock>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { SlicePlane } from '@/galavi/slice-geometry'
import { useCereviStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'

const store = useCereviStore()
const views: { plane: SlicePlane; label: string; symbol: string }[] = [
  { plane: 'xy', label: 'Coronal', symbol: 'C' },
  { plane: 'yz', label: 'Sagittal', symbol: 'S' },
  { plane: 'xz', label: 'Horizontal', symbol: 'H' },
]
const activeView = computed(() => views.find((view) => view.plane === store.plane) ?? views[2]!)
</script>

<style scoped>
.plane-symbol {
  color: currentColor;
  font-size: 13px;
  font-weight: 800;
}

.view-selector {
  display: flex;
  min-width: 170px;
  flex-direction: column;
  gap: 4px;
}

.view-selector button {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--galavi-text-dim);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.view-selector button:hover { color: var(--galavi-text); }
.view-selector button.active {
  border-color: var(--galavi-accent);
  background: var(--galavi-accent-soft);
  color: var(--galavi-accent);
}
.view-selector button span {
  display: grid;
  width: 23px;
  height: 23px;
  place-items: center;
  border: 1px solid currentColor;
  font-size: 11px;
  font-weight: 800;
}
</style>

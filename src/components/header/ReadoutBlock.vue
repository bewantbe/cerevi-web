<template>
  <HudBlock v-if="store.mode !== 'grid'" label="Readout" placement="bl" :fold-priority="0">
    <div class="readout-rows" aria-live="polite">
      <div class="readout-row">
        <span class="readout-label">POS</span>
        <span class="readout-value">{{ store.positionReadout }}</span>
      </div>
      <div class="readout-row">
        <span class="readout-label">RESOLUTION</span>
        <span class="readout-value">{{ store.resolutionReadout }}</span>
      </div>
    </div>
  </HudBlock>
</template>

<script setup lang="ts">
import { useVISoRStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'

const store = useVISoRStore()
</script>

<style scoped>
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
  color: var(--galavi-text-dim);
  font-size: 10px;
  letter-spacing: 0.14em;
}
.readout-value {
  color: var(--galavi-text);
  font-family: var(--galavi-font-mono);
  font-size: var(--galavi-font-size);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>

<template>
  <HudBlock v-if="visible" label="Channel" placement="tr" :fold-priority="1">
    <div class="channel-list">
      <div
        v-for="channel in channels"
        :key="channel.index"
        class="channel-item"
        :class="{ active: channel.index === store.channel }"
      >
        <button
          type="button"
          class="channel-row"
          :aria-pressed="channel.index === store.channel"
          @click="store.setChannel(channel.index)"
        >
          <span class="swatch" :style="{ backgroundColor: channel.color }" aria-hidden="true"></span>
          <span class="channel-label">{{ channel.label }}</span>
        </button>
        <div v-if="channel.index === store.channel" class="channel-contrast">
          <span class="contrast-label">Contrast</span>
          <DualRangeSlider
            :model-value="[store.contrastMin, store.contrastMax]"
            :bounds="store.contrastRange"
            :step="0.001"
            scale="log"
            @update:model-value="store.setContrast"
          />
        </div>
      </div>
    </div>
  </HudBlock>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVISoRStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'
import DualRangeSlider from '@/components/viewer/DualRangeSlider.vue'

const store = useVISoRStore()

// Same visibility as the old header's channel/contrast controls.
const visible = computed(() => store.mode !== 'slice' && Boolean(store.setupCtx))
const channels = computed(() => store.setupCtx?.channels ?? [])
</script>

<style scoped>
.channel-list {
  display: flex;
  min-width: 200px;
  flex-direction: column;
  gap: 4px;
}

.channel-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--galavi-border);
}
.channel-item:last-child { border-bottom: 0; padding-bottom: 0; }

.channel-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--galavi-text);
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.channel-row:hover { border-color: var(--galavi-border); }
.channel-item.active > .channel-row {
  border-color: var(--galavi-accent);
  background: var(--galavi-accent-soft);
}

.swatch {
  width: 10px;
  height: 10px;
  flex: 0 0 auto;
  border-radius: 1px;
  box-shadow: 0 0 6px var(--galavi-accent-soft);
}

.channel-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-contrast {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 6px 4px;
}
.contrast-label {
  flex: 0 0 auto;
  color: var(--galavi-text-dim);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.channel-contrast :deep(.range-inputs) { flex: 1; }
</style>

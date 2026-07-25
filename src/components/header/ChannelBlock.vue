<template>
  <HudBlock
    v-if="store.setupCtx"
    label="Channel"
    side="right"
    position="bottom"
    style="bottom: var(--lower-panel-baseline, calc(var(--edge, 30px) + 76px))"
    :default-open="store.mode === 'volume' || store.mode === 'slice'"
    :state-key="store.mode"
    :fold-priority="store.mode === 'slice' ? 9 : 0"
  >
    <div v-if="store.mode === 'slice'" class="channel-list slice-channels">
      <div
        v-for="channel in store.galleryChannels"
        :key="channel.index"
        class="channel-item"
      >
        <div class="channel-heading">
          <button
            type="button"
            class="visibility-button"
            :class="{ active: channel.visible }"
            :aria-label="`${channel.visible ? 'Hide' : 'Show'} ${channel.label}`"
            :aria-pressed="channel.visible"
            @click="channel.visible = !channel.visible"
          >
            <svg v-if="channel.visible" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
              <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
              <circle cx="8" cy="8" r="2" />
            </svg>
            <svg v-else viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
              <path d="M3 3l10 10" />
              <path d="M6.5 4.1A6.9 6.9 0 0 1 8 4c4.1 0 6.5 4 6.5 4a12.7 12.7 0 0 1-2.2 2.7M4.1 5.3A12.4 12.4 0 0 0 1.5 8s2.4 4 6.5 4a6.7 6.7 0 0 0 2.6-.5" />
            </svg>
          </button>
          <input v-model="channel.color" type="color" class="channel-color" :aria-label="`${channel.label} color`" />
          <span class="channel-label">{{ channel.label }}</span>
        </div>
        <DualRangeSlider
          :model-value="[channel.contrastMin, channel.contrastMax]"
          :bounds="store.contrastRange"
          :step="0.001"
          scale="log"
          @update:model-value="(range) => store.setGalleryChannelContrast(channel.index, range)"
        />
      </div>
    </div>

    <div v-else class="channel-list">
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
import { useCereviStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'
import DualRangeSlider from '@/components/viewer/DualRangeSlider.vue'

const store = useCereviStore()

const channels = computed(() => store.setupCtx?.channels ?? [])
</script>

<style scoped>
.channel-list {
  display: flex;
  min-width: 248px;
  flex-direction: column;
  gap: 4px;
}

.channel-heading {
  display: flex;
  align-items: center;
  gap: 8px;
}

.visibility-button {
  display: inline-flex;
  width: 27px;
  height: 27px;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  padding: 0;
  border: 1px solid var(--galavi-border);
  background: transparent;
  color: var(--galavi-text-dim);
  cursor: pointer;
}
.visibility-button.active {
  border-color: var(--galavi-accent);
  background: var(--galavi-accent-soft);
  color: var(--galavi-accent);
}

.channel-color {
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  padding: 2px;
  border: 1px solid var(--galavi-border);
  background: transparent;
  cursor: pointer;
}
.channel-color::-webkit-color-swatch-wrapper { padding: 0; }
.channel-color::-webkit-color-swatch { border: 0; }
.channel-color::-moz-color-swatch { border: 0; }

.slice-channels .channel-item { gap: 9px; }

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

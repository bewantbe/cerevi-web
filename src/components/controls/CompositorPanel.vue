<template>
  <div class="compositor-panel">
    <div class="panel-body">
      <p v-if="channels.length === 0" class="empty-hint">No channels available.</p>

      <section v-for="ch in channels" :key="ch.index" class="control-card">
        <div class="channel-head">
          <button
            type="button"
            class="visibility-toggle"
            :class="{ active: ch.visible }"
            :aria-label="ch.visible ? 'Hide channel' : 'Show channel'"
            @click="emit('channel-visible', ch.index, !ch.visible)"
          >
            <el-icon :size="16">
              <View v-if="ch.visible" />
              <Hide v-else />
            </el-icon>
          </button>
          <span class="channel-name" :class="{ muted: !ch.visible }">{{ ch.label }}</span>
          <el-color-picker
            :model-value="ch.color"
            size="small"
            class="channel-color"
            @change="(c: string | null) => onColor(ch.index, c)"
          />
        </div>

        <div class="contrast-row">
          <el-slider
            range
            :model-value="[ch.contrastMin, ch.contrastMax]"
            :min="ch.bounds[0]"
            :max="ch.bounds[1]"
            :step="step(ch)"
            :show-tooltip="false"
            class="contrast-slider"
            @input="(val: number | number[]) => onContrast(ch.index, val)"
            @change="(val: number | number[]) => onContrast(ch.index, val)"
          />
          <span class="range-value">{{ ch.contrastMin.toFixed(3) }} – {{ ch.contrastMax.toFixed(3) }}</span>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { View, Hide } from '@element-plus/icons-vue'
import type { CompositorChannel } from '@/composables/useCompositorState'

interface Props {
  channels: CompositorChannel[]
}

defineProps<Props>()
const emit = defineEmits<{
  'channel-color': [index: number, color: string]
  'channel-contrast': [index: number, min: number, max: number]
  'channel-visible': [index: number, visible: boolean]
}>()

function step(ch: CompositorChannel): number {
  return Math.max(1e-5, ch.bounds[1] / 1000)
}

function onColor(index: number, color: string | null) {
  if (!color) return
  emit('channel-color', index, color)
}

function onContrast(index: number, val: number | number[]) {
  if (!Array.isArray(val)) return
  emit('channel-contrast', index, val[0], val[1])
}
</script>

<style scoped>
.compositor-panel {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  font-family: var(--font-sans);
}

.panel-body {
  padding: 12px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  flex: 1;
  min-height: 0;
}

.empty-hint {
  color: var(--c-text-muted);
  font-size: 12px;
  margin: 0;
}

.control-card {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  background: var(--c-bg-elev);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.channel-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.visibility-toggle {
  appearance: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  background: var(--c-bg-soft);
  color: var(--c-text-muted);
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}

.visibility-toggle.active {
  color: var(--c-accent);
  border-color: var(--c-accent);
  background: var(--c-accent-soft);
}

.channel-name {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--c-text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-name.muted {
  color: var(--c-text-muted);
}

.channel-color {
  flex: 0 0 auto;
}

.contrast-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0 6px;
}

.contrast-slider :deep(.el-slider__runway) {
  background: var(--c-border-strong);
}
.contrast-slider :deep(.el-slider__bar) {
  background: var(--c-accent);
}
.contrast-slider :deep(.el-slider__button) {
  border-color: var(--c-accent);
  background: #fff;
}

.range-value {
  color: var(--c-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}
</style>

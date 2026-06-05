<template>
  <div class="compositor-cell">
    <canvas ref="canvasEl" class="compositor-canvas"></canvas>

    <!-- Perspective switcher (top-left) -->
    <div class="perspective-overlay" @click.stop>
      <button
        v-for="p in perspectives"
        :key="p.key"
        type="button"
        class="perspective-btn"
        :class="{ active: p.key === perspective }"
        @click="emit('update:perspective', p.key)"
      >
        {{ p.label }}
      </button>
    </div>

    <!-- Slice selector (bottom) -->
    <div class="slice-control" @click.stop>
      <label>{{ sliceLabel }}</label>
      <el-slider
        :model-value="sliceValue"
        :min="0"
        :max="sliceMax"
        :step="1"
        class="slice-slider"
        @input="(val: number | number[]) => onSlice(val)"
        @change="(val: number | number[]) => onSlice(val)"
      />
      <span class="slice-value">{{ sliceValue }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { type CompositorPerspective, SLICE_DEFS } from '@/galavi-setup'

interface Props {
  perspective: CompositorPerspective
  sliceValue: number
  sliceMax: number
  sliceLabel: string
}

defineProps<Props>()
const emit = defineEmits<{
  'update:perspective': [key: CompositorPerspective]
  slice: [value: number]
}>()

const perspectives = SLICE_DEFS.map((d) => ({
  key: d.key as CompositorPerspective,
  label: `${d.anatomicalLabel} (${d.key.toUpperCase()})`,
}))

const canvasEl = ref<HTMLCanvasElement | null>(null)

function onSlice(val: number | number[]) {
  emit('slice', Array.isArray(val) ? val[0] : val)
}

defineExpose({ getCanvas: () => canvasEl.value })
</script>

<style scoped>
.compositor-cell {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  height: 100%;
  background: #000;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.compositor-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* Perspective switcher overlay */
.perspective-overlay {
  position: absolute;
  top: 8px;
  left: 8px;
  display: flex;
  gap: 4px;
  z-index: 10;
}

.perspective-btn {
  appearance: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.5);
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-family: var(--font-mono);
  letter-spacing: 0.02em;
  padding: 4px 9px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.perspective-btn:hover {
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
}

.perspective-btn.active {
  color: var(--c-accent);
  border-color: var(--c-accent);
  background: rgba(0, 0, 0, 0.7);
}

/* Slice control overlay */
.slice-control {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  padding: 24px 14px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.slice-control label {
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.slice-slider {
  flex: 1;
}

.slice-value {
  color: #fff;
  font-size: 11px;
  font-family: var(--font-mono);
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.slice-control :deep(.el-slider__runway) {
  background: rgba(255, 255, 255, 0.18);
}
.slice-control :deep(.el-slider__bar) {
  background: var(--c-accent);
}
.slice-control :deep(.el-slider__button) {
  border-color: var(--c-accent);
  background: #fff;
}
</style>

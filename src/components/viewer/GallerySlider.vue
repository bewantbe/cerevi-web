<template>
  <div class="slider-bar">
    <button type="button" class="play-button" :title="playing ? 'Pause' : 'Play'" @click="togglePlay">
      <el-icon :size="16"><component :is="playing ? VideoPause : VideoPlay" /></el-icon>
    </button>
    <div ref="track" class="track" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerleave="onPointerLeave">
      <div class="track-rail"></div>
      <div class="track-fill" :style="{ width: `${fillPercent}%` }"></div>
      <div class="track-thumb" :style="{ left: `${fillPercent}%` }"></div>
    </div>
    <span class="frame-label">{{ label }} · {{ value }} / {{ max }}</span>
    <div v-show="hoverIndex !== null" class="preview" :style="{ left: `${previewX}px` }">
      <canvas ref="previewCanvas" class="preview-canvas" :width="PREVIEW_SIZE" :height="PREVIEW_SIZE"></canvas>
      <span>{{ hoverIndex }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { VideoPause, VideoPlay } from '@element-plus/icons-vue'

const props = defineProps<{ value: number; max: number; label: string }>()
const emit = defineEmits<{
  'update:value': [value: number]
  'preview-hover': [index: number | null]
  'preview-ready': [canvas: HTMLCanvasElement]
}>()

const PREVIEW_SIZE = 168
const track = ref<HTMLElement | null>(null)
const previewCanvas = ref<HTMLCanvasElement | null>(null)
const hoverIndex = ref<number | null>(null)
const previewX = ref(0)
const playing = ref(false)
let dragging = false
let animationFrame = 0
let lastTick = 0
const PLAY_INTERVAL_MS = 2000

const fillPercent = computed(() => props.max > 0 ? (props.value / props.max) * 100 : 0)

function indexFromEvent(event: PointerEvent): number {
  const bounds = track.value?.getBoundingClientRect()
  if (!bounds) return props.value
  const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
  return Math.round(fraction * props.max)
}

function onPointerDown(event: PointerEvent) {
  dragging = true
  ;(event.target as HTMLElement).setPointerCapture?.(event.pointerId)
  emit('update:value', indexFromEvent(event))
}

function onPointerMove(event: PointerEvent) {
  const bounds = track.value?.getBoundingClientRect()
  if (!bounds) return
  const index = indexFromEvent(event)
  hoverIndex.value = index
  const localX = event.clientX - bounds.left
  previewX.value = Math.min(bounds.width - PREVIEW_SIZE / 2, Math.max(PREVIEW_SIZE / 2, localX)) + 44
  emit('preview-hover', index)
  if (dragging) emit('update:value', index)
}

function onPointerLeave() {
  hoverIndex.value = null
  emit('preview-hover', null)
}

function endDrag() {
  dragging = false
}

function togglePlay() {
  playing.value = !playing.value
  if (playing.value) {
    lastTick = performance.now()
    animationFrame = requestAnimationFrame(step)
  } else stop()
}

function step(now: number) {
  if (!playing.value) return
  if (now - lastTick >= PLAY_INTERVAL_MS) {
    lastTick = now
    emit('update:value', props.value >= props.max ? 0 : props.value + 1)
  }
  animationFrame = requestAnimationFrame(step)
}

function stop() {
  playing.value = false
  if (animationFrame) cancelAnimationFrame(animationFrame)
  animationFrame = 0
}

onMounted(() => {
  window.addEventListener('pointerup', endDrag)
  if (previewCanvas.value) emit('preview-ready', previewCanvas.value)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointerup', endDrag)
  stop()
})

defineExpose({ stop })
</script>

<style scoped>
.slider-bar { position: relative; display: flex; align-items: center; gap: 12px; padding: 10px 14px; border: 1px solid var(--c-border); border-radius: var(--radius-md); background: var(--c-bg-overlay); backdrop-filter: blur(10px); }
.play-button { display: inline-flex; width: 32px; height: 30px; align-items: center; justify-content: center; flex: 0 0 auto; padding: 0; border: 0; border-radius: var(--radius-sm); background: var(--c-accent); color: var(--c-on-accent); cursor: pointer; }
.track { position: relative; display: flex; height: 24px; align-items: center; flex: 1; min-width: 80px; cursor: pointer; touch-action: none; }
.track-rail, .track-fill { position: absolute; left: 0; height: 4px; border-radius: 2px; }
.track-rail { right: 0; background: var(--c-border-strong); }
.track-fill { background: var(--c-accent); }
.track-thumb { position: absolute; top: 50%; width: 14px; height: 14px; border: 2px solid var(--c-bg); border-radius: 50%; background: var(--c-accent); transform: translate(-50%, -50%); }
.frame-label { min-width: 128px; flex: 0 0 auto; color: var(--c-text-muted); font: 12px var(--font-mono); font-variant-numeric: tabular-nums; text-align: right; white-space: nowrap; }
.preview { position: absolute; bottom: calc(100% + 10px); display: flex; align-items: center; flex-direction: column; gap: 4px; padding: 6px; border: 1px solid var(--c-border-strong); border-radius: var(--radius-sm); background: var(--c-bg-elev); box-shadow: var(--shadow-lg); color: var(--c-text); font: 11px var(--font-mono); transform: translateX(-50%); pointer-events: none; }
.preview-canvas { display: block; width: 168px; height: 168px; background: #000; }
@media (max-width: 720px) { .frame-label { min-width: 0; } }
</style>
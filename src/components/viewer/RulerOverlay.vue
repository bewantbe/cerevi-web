<template>
  <div ref="root" class="ruler-overlay">
    <svg class="ruler-svg" :width="size.width" :height="size.height">
      <line :x1="start.x" :y1="start.y" :x2="end.x" :y2="end.y" class="ruler-line" @pointerdown="beginDrag('line', $event)" />
      <g class="ruler-handle" @pointerdown="beginDrag('start', $event)">
        <circle :cx="start.x" :cy="start.y" r="9" class="handle-hit" />
        <circle :cx="start.x" :cy="start.y" r="5" class="handle-dot" />
      </g>
      <g class="ruler-handle" @pointerdown="beginDrag('end', $event)">
        <circle :cx="end.x" :cy="end.y" r="9" class="handle-hit" />
        <circle :cx="end.x" :cy="end.y" r="5" class="handle-dot" />
      </g>
    </svg>
    <div class="ruler-label" :style="{ left: `${midpoint.x}px`, top: `${midpoint.y}px` }">{{ distanceLabel }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'

const props = withDefaults(defineProps<{ unitsPerPixel: number; unit: string; resetNonce: number; rightInset?: number }>(), {
  rightInset: 0,
})
const root = ref<HTMLElement | null>(null)
const size = reactive({ width: 0, height: 0 })
const start = reactive({ x: 0, y: 0 })
const end = reactive({ x: 0, y: 0 })
let drag: 'start' | 'end' | 'line' | null = null
let last = { x: 0, y: 0 }
let resizeObserver: ResizeObserver | undefined

function measure() {
  size.width = root.value?.clientWidth ?? 0
  size.height = root.value?.clientHeight ?? 0
}

function reset() {
  measure()
  const right = Math.max(60, size.width - props.rightInset - 40)
  start.x = Math.max(40, right - Math.min(200, size.width * 0.3))
  start.y = 64
  end.x = right
  end.y = 64
}

function beginDrag(target: 'start' | 'end' | 'line', event: PointerEvent) {
  drag = target
  last = { x: event.clientX, y: event.clientY }
  event.stopPropagation()
  event.preventDefault()
}

function onMove(event: PointerEvent) {
  if (!drag) return
  const deltaX = event.clientX - last.x
  const deltaY = event.clientY - last.y
  last = { x: event.clientX, y: event.clientY }
  if (drag === 'start' || drag === 'line') {
    start.x += deltaX
    start.y += deltaY
  }
  if (drag === 'end' || drag === 'line') {
    end.x += deltaX
    end.y += deltaY
  }
}

function endDrag() {
  drag = null
}

const midpoint = computed(() => ({ x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }))
const distanceLabel = computed(() => {
  const distance = Math.hypot(end.x - start.x, end.y - start.y) * props.unitsPerPixel
  if (!Number.isFinite(distance) || distance <= 0) return '-'
  if (['μm', 'µm', 'um'].includes(props.unit) && distance >= 1000) return `${(distance / 1000).toFixed(2)} mm`
  return `${distance.toFixed(distance >= 100 ? 0 : distance >= 1 ? 1 : 2)} ${props.unit || 'μm'}`
})

watch(() => props.resetNonce, reset)
watch(() => props.rightInset, reset)
onMounted(() => {
  reset()
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', endDrag)
  resizeObserver = new ResizeObserver(measure)
  if (root.value) resizeObserver.observe(root.value)
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', endDrag)
  resizeObserver?.disconnect()
})
</script>

<style scoped>
.ruler-overlay { position: absolute; inset: 0; z-index: 35; pointer-events: none; }
.ruler-svg { position: absolute; inset: 0; }
.ruler-line { stroke: var(--c-warning); stroke-width: 2.5; pointer-events: stroke; cursor: move; }
.ruler-handle { pointer-events: all; cursor: grab; }
.handle-hit { fill: transparent; }
.handle-dot { fill: var(--c-warning); stroke: #000; stroke-width: 1; }
.ruler-label { position: absolute; transform: translate(-50%, -150%); padding: 3px 8px; border-radius: var(--radius-sm); background: var(--c-warning); color: #1b1300; font: 700 12px var(--font-mono); white-space: nowrap; pointer-events: none; }
</style>
<template>
  <div class="range-inputs">
    <div ref="slider" class="range-slider" :style="sliderStyle" @mousedown.prevent="onTrackMouseDown">
      <div class="range-track"></div>
      <button type="button" class="range-thumb" :style="minThumbStyle" aria-label="Minimum" @mousedown.stop.prevent="startDrag('min', $event)"></button>
      <button type="button" class="range-thumb" :style="maxThumbStyle" aria-label="Maximum" @mousedown.stop.prevent="startDrag('max', $event)"></button>
    </div>
    <span v-if="showValue" class="range-value">{{ displayValue }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'

type ContrastScale = 'linear' | 'log'

const props = withDefaults(defineProps<{
  modelValue: [number, number]
  bounds: [number, number]
  step: number
  scale?: ContrastScale
  decimals?: number
  showValue?: boolean
}>(), {
  scale: 'linear',
  decimals: 3,
  showValue: true,
})

const emit = defineEmits<{ 'update:modelValue': [value: [number, number]] }>()
const slider = ref<HTMLDivElement | null>(null)
const activeThumb = ref<'min' | 'max' | null>(null)
let stopDragListeners: (() => void) | undefined

const span = computed(() => Math.max(props.bounds[1] - props.bounds[0], props.step))
const logEpsilon = computed(() => Math.max(span.value * 1e-3, 1e-9))

function clamp(value: number): number {
  return Math.max(props.bounds[0], Math.min(props.bounds[1], value))
}

function snap(value: number): number {
  const steps = Math.round((clamp(value) - props.bounds[0]) / props.step)
  return clamp(props.bounds[0] + steps * props.step)
}

function valueToPercent(value: number): number {
  const low = props.bounds[0]
  const high = props.bounds[1]
  if (props.scale === 'linear') return ((clamp(value) - low) / span.value) * 100
  const epsilon = logEpsilon.value
  const numerator = Math.log(clamp(value) - low + epsilon) - Math.log(epsilon)
  const denominator = Math.log(high - low + epsilon) - Math.log(epsilon)
  return denominator > 0 ? (numerator / denominator) * 100 : 0
}

function percentToValue(percent: number): number {
  const low = props.bounds[0]
  const ratio = Math.max(0, Math.min(1, percent / 100))
  if (props.scale === 'linear') return low + ratio * span.value
  const epsilon = logEpsilon.value
  return low + Math.exp(Math.log(epsilon) + ratio * (Math.log(props.bounds[1] - low + epsilon) - Math.log(epsilon))) - epsilon
}

function valueFromMouse(event: MouseEvent): number {
  const bounds = slider.value?.getBoundingClientRect()
  if (!bounds || bounds.width <= 0) return props.modelValue[0]
  return snap(percentToValue(((event.clientX - bounds.left) / bounds.width) * 100))
}

function setThumb(which: 'min' | 'max', value: number) {
  const next = snap(value)
  emit('update:modelValue', which === 'min'
    ? [Math.min(next, props.modelValue[1]), props.modelValue[1]]
    : [props.modelValue[0], Math.max(next, props.modelValue[0])])
}

function teardownDrag() {
  stopDragListeners?.()
  stopDragListeners = undefined
  activeThumb.value = null
}

function startDrag(which: 'min' | 'max', event: MouseEvent) {
  teardownDrag()
  activeThumb.value = which
  const onMove = (nextEvent: MouseEvent) => setThumb(which, valueFromMouse(nextEvent))
  const onUp = () => teardownDrag()
  stopDragListeners = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  onMove(event)
}

function onTrackMouseDown(event: MouseEvent) {
  const next = valueFromMouse(event)
  startDrag(Math.abs(next - props.modelValue[0]) <= Math.abs(next - props.modelValue[1]) ? 'min' : 'max', event)
}

const sliderStyle = computed(() => ({
  '--start': `${valueToPercent(props.modelValue[0])}%`,
  '--end': `${valueToPercent(props.modelValue[1])}%`,
}))
const minThumbStyle = computed(() => ({ left: `${valueToPercent(props.modelValue[0])}%`, zIndex: activeThumb.value === 'max' ? 2 : 3 }))
const maxThumbStyle = computed(() => ({ left: `${valueToPercent(props.modelValue[1])}%`, zIndex: activeThumb.value === 'min' ? 2 : 3 }))
const displayValue = computed(() => `${props.modelValue[0].toFixed(props.decimals)} - ${props.modelValue[1].toFixed(props.decimals)}`)

onBeforeUnmount(teardownDrag)
</script>

<style scoped>
.range-inputs { display: flex; flex-direction: column; gap: 7px; min-width: 0; padding: 0 6px; }
.range-slider { --start: 0%; --end: 100%; position: relative; width: 100%; height: 24px; cursor: pointer; }
.range-track { position: absolute; top: 50%; left: 0; right: 0; height: 4px; border-radius: 2px; transform: translateY(-50%); background: rgba(145, 161, 183, 0.22); }
.range-track::before { content: ''; position: absolute; inset: 0 calc(100% - var(--end)) 0 var(--start); border-radius: inherit; background: var(--c-accent); }
.range-thumb { position: absolute; top: 50%; width: 14px; height: 14px; padding: 0; appearance: none; border-radius: 50%; border: 1px solid var(--c-bg); background: var(--c-text-strong); box-shadow: 0 0 0 2px var(--c-accent-strong); transform: translate(-50%, -50%); cursor: pointer; }
.range-thumb:hover, .range-thumb:active { background: var(--c-accent-hover); }
.range-thumb:focus-visible { outline: 2px solid var(--c-accent); outline-offset: 2px; }
.range-value { color: var(--c-text-muted); font: 12px var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
</style>
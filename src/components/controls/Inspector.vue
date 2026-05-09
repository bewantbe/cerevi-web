<template>
  <aside class="inspector">
    <div class="panel-header">
      <h2>Inspector</h2>
    </div>
    <div class="inspector-body">
      <section class="control-card">
        <h3 class="card-title">Channel</h3>
        <div class="control-group">
          <select :value="channel" aria-label="Channel" @change="onChannelSelect">
            <option v-for="(ch, idx) in channelOptions" :key="idx" :value="idx">
              {{ ch.label }}
            </option>
          </select>
        </div>
      </section>

      <section class="control-card">
        <div class="control-label-row">
          <h3 class="card-title">Contrast</h3>
          <div class="scale-toggle" role="group" aria-label="Contrast scale">
            <button
              type="button"
              class="scale-btn"
              :class="{ active: contrastScale === 'linear' }"
              @click="contrastScale = 'linear'"
            >Lin</button>
            <button
              type="button"
              class="scale-btn"
              :class="{ active: contrastScale === 'log' }"
              @click="contrastScale = 'log'"
            >Log</button>
          </div>
        </div>
        <div class="range-inputs">
          <div
            ref="contrastSlider"
            class="range-slider"
            :style="contrastSliderStyle"
            @mousedown.prevent="onContrastTrackMouseDown"
          >
            <div class="range-track"></div>
            <button
              type="button"
              class="range-thumb"
              :style="contrastMinThumbStyle"
              aria-label="Contrast minimum"
              @mousedown.stop.prevent="startContrastDrag('min', $event)"
            ></button>
            <button
              type="button"
              class="range-thumb"
              :style="contrastMaxThumbStyle"
              aria-label="Contrast maximum"
              @mousedown.stop.prevent="startContrastDrag('max', $event)"
            ></button>
          </div>
          <span class="range-value">{{ contrastMin.toFixed(3) }} – {{ contrastMax.toFixed(3) }}</span>
        </div>
      </section>

      <section class="control-card">
        <h3 class="card-title">Show Target</h3>
        <button
          type="button"
          class="switch"
          :class="{ active: showTarget }"
          @click="setTargetVisible(!showTarget)"
        >
          <span class="switch-track"><span class="switch-thumb"></span></span>
          <span class="switch-copy">{{ showTarget ? 'Visible on active view' : 'Hidden' }}</span>
        </button>
      </section>

      <section class="control-card">
        <h3 class="card-title">Show Atlas</h3>
        <button
          type="button"
          class="switch switch-region"
          :class="{ active: showAtlas }"
          @click="setAtlasVisible(!showAtlas)"
        >
          <span class="switch-track"><span class="switch-thumb"></span></span>
          <span class="switch-copy">{{ showAtlas ? 'Visible' : 'Hidden' }}</span>
        </button>

        <div v-if="showAtlas" class="control-group">
          <label>Atlas Opacity</label>
          <div class="range-inputs">
            <div
              ref="opacitySlider"
              class="range-slider single"
              :style="opacitySliderStyle"
              @mousedown.prevent="onOpacityTrackMouseDown"
            >
              <div class="range-track"></div>
              <button
                type="button"
                class="range-thumb"
                :style="opacityThumbStyle"
                aria-label="Atlas opacity"
                @mousedown.stop.prevent="startOpacityDrag($event)"
              ></button>
            </div>
            <span class="range-value">{{ atlasOpacity.toFixed(2) }}</span>
          </div>
        </div>
      </section>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import type { Galavi, Vec2 } from 'galavi'
import { REGION_DATA_IDS, SLICE_DEFS } from '@/galavi-setup'

interface Props {
  getGalavi: () => Galavi | undefined
  activeView: string | undefined
  channels: number[]
  channel: number
  channelLabels?: string[]
  contrastBounds: Vec2
  contrastStep: number
  contrastMin: number
  contrastMax: number
}

const props = defineProps<Props>()
const emit = defineEmits<{
  'update:channel': [value: number]
  'update:contrastMin': [value: number]
  'update:contrastMax': [value: number]
  'channel-change': [value: number]
  'contrast-change': [range: [number, number]]
}>()

// ---------------------------------------------------------------------------
// Channel options (with marker / wavelength)
// ---------------------------------------------------------------------------

const channelOptions = computed(() =>
  props.channels.map((idx) => {
    const label = props.channelLabels?.[idx] ?? `Channel ${idx}`
    return { idx, label }
  }),
)

function onChannelSelect(e: Event) {
  const value = Number((e.target as HTMLSelectElement).value)
  emit('update:channel', value)
  emit('channel-change', value)
}

// ---------------------------------------------------------------------------
// Contrast dual-thumb slider (ported from the-explorer)
//
// Slider value space (what the parent stores in contrastMin/contrastMax) is
// always *linear* — galavi's shader does linear `(v - lo) / (hi - lo)`. The
// `contrastScale` toggle only changes how that linear value maps to the
// horizontal pixel position, so log mode gives finer control over low
// values (typical for fluorescence with a long dim tail) without changing
// what the renderer sees.
// ---------------------------------------------------------------------------

const contrastSlider = ref<HTMLDivElement | null>(null)
const activeContrastThumb = ref<'min' | 'max' | null>(null)
const contrastScale = ref<'linear' | 'log'>('linear')
let stopContrastDrag: (() => void) | undefined

const contrastSpan = computed(() =>
  Math.max(props.contrastBounds[1] - props.contrastBounds[0], props.contrastStep),
)

// Offset keeps log() finite when the lower bound is 0 (the common case).
// Picking 0.1% of the span gives ~3 decades of useful resolution while
// still letting the leftmost position represent the true min.
const LOG_EPS_FRAC = 1e-3
const logEps = computed(() => Math.max(contrastSpan.value * LOG_EPS_FRAC, 1e-9))

function valueToPercent(value: number): number {
  const lo = props.contrastBounds[0]
  const hi = props.contrastBounds[1]
  const v = Math.max(lo, Math.min(hi, value))
  if (contrastScale.value === 'linear') {
    return ((v - lo) / contrastSpan.value) * 100
  }
  const eps = logEps.value
  const num = Math.log(v - lo + eps) - Math.log(eps)
  const den = Math.log(hi - lo + eps) - Math.log(eps)
  return den > 0 ? (num / den) * 100 : 0
}

function percentToValue(percent: number): number {
  const lo = props.contrastBounds[0]
  const hi = props.contrastBounds[1]
  const p = Math.max(0, Math.min(1, percent / 100))
  if (contrastScale.value === 'linear') {
    return lo + p * contrastSpan.value
  }
  const eps = logEps.value
  const logLo = Math.log(eps)
  const logHi = Math.log(hi - lo + eps)
  return lo + Math.exp(logLo + p * (logHi - logLo)) - eps
}

function clampContrastValue(value: number): number {
  return Math.max(props.contrastBounds[0], Math.min(props.contrastBounds[1], value))
}

function snapContrastValue(value: number): number {
  const steps = Math.round((clampContrastValue(value) - props.contrastBounds[0]) / props.contrastStep)
  return clampContrastValue(props.contrastBounds[0] + steps * props.contrastStep)
}

function getContrastPercent(value: number): number {
  return valueToPercent(value)
}

const contrastSliderStyle = computed(() => ({
  '--start': `${getContrastPercent(props.contrastMin)}%`,
  '--end': `${getContrastPercent(props.contrastMax)}%`,
}))

const contrastMinThumbStyle = computed(() => ({
  left: `${getContrastPercent(props.contrastMin)}%`,
  zIndex: activeContrastThumb.value === 'max' ? '2' : '3',
}))

const contrastMaxThumbStyle = computed(() => ({
  left: `${getContrastPercent(props.contrastMax)}%`,
  zIndex: activeContrastThumb.value === 'min' ? '2' : '3',
}))

function getContrastValueFromMouse(event: MouseEvent): number {
  const slider = contrastSlider.value
  if (!slider) return props.contrastMin
  const rect = slider.getBoundingClientRect()
  if (rect.width <= 0) return props.contrastMin
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  return snapContrastValue(percentToValue(ratio * 100))
}

function setContrastThumbValue(which: 'min' | 'max', value: number) {
  const next = snapContrastValue(value)
  let lo = props.contrastMin
  let hi = props.contrastMax
  if (which === 'min') {
    lo = Math.min(next, hi)
    emit('update:contrastMin', lo)
  } else {
    hi = Math.max(next, lo)
    emit('update:contrastMax', hi)
  }
  emit('contrast-change', [lo, hi])
}

function teardownContrastDrag() {
  stopContrastDrag?.()
  stopContrastDrag = undefined
  activeContrastThumb.value = null
}

function startContrastDrag(which: 'min' | 'max', event: MouseEvent) {
  teardownContrastDrag()
  activeContrastThumb.value = which
  const onMove = (e: MouseEvent) => setContrastThumbValue(which, getContrastValueFromMouse(e))
  const onUp = () => teardownContrastDrag()
  stopContrastDrag = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  onMove(event)
}

function onContrastTrackMouseDown(event: MouseEvent) {
  const next = getContrastValueFromMouse(event)
  const which = Math.abs(next - props.contrastMin) <= Math.abs(next - props.contrastMax) ? 'min' : 'max'
  startContrastDrag(which, event)
}

// ---------------------------------------------------------------------------
// Show Target — visibility only on active view
// ---------------------------------------------------------------------------

const showTarget = ref(false)
const MARKER_VIEWS = ['volume', ...SLICE_DEFS.map(d => d.key)]

function syncMarkerVisibility() {
  const galavi = props.getGalavi()
  if (!galavi) return
  const active = galavi.getActiveView()
  for (const viewName of MARKER_VIEWS) {
    galavi.view(viewName).setOverlayOptions('marker', {
      visible: showTarget.value && active === viewName,
    })
  }
}

function setTargetVisible(visible: boolean) {
  showTarget.value = visible
  syncMarkerVisibility()
}

// ---------------------------------------------------------------------------
// Show Atlas + opacity
// ---------------------------------------------------------------------------

const showAtlas = ref(false)
const atlasOpacity = ref(0.6)

function applyAtlasVisibility() {
  const galavi = props.getGalavi()
  if (!galavi) return
  for (const id of REGION_DATA_IDS) {
    galavi.layer(id)?.setRender({ visible: showAtlas.value })
  }
}

function setAtlasVisible(visible: boolean) {
  showAtlas.value = visible
  applyAtlasVisibility()
}

function applyAtlasOpacity() {
  const galavi = props.getGalavi()
  if (!galavi) return
  galavi.layer('regionSurface')?.setRender({ opacity: atlasOpacity.value })
}

// Opacity slider (single-thumb)
const opacitySlider = ref<HTMLDivElement | null>(null)
let stopOpacityDrag: (() => void) | undefined

const opacitySliderStyle = computed(() => ({
  '--start': '0%',
  '--end': `${atlasOpacity.value * 100}%`,
}))

const opacityThumbStyle = computed(() => ({
  left: `${atlasOpacity.value * 100}%`,
  zIndex: '3',
}))

function getOpacityValueFromMouse(event: MouseEvent): number {
  const slider = opacitySlider.value
  if (!slider) return atlasOpacity.value
  const rect = slider.getBoundingClientRect()
  if (rect.width <= 0) return atlasOpacity.value
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  return Math.round(ratio * 100) / 100
}

function setOpacityValue(value: number) {
  atlasOpacity.value = Math.max(0, Math.min(1, value))
  applyAtlasOpacity()
}

function teardownOpacityDrag() {
  stopOpacityDrag?.()
  stopOpacityDrag = undefined
}

function startOpacityDrag(event: MouseEvent) {
  teardownOpacityDrag()
  const onMove = (e: MouseEvent) => setOpacityValue(getOpacityValueFromMouse(e))
  const onUp = () => teardownOpacityDrag()
  stopOpacityDrag = () => {
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
  onMove(event)
}

function onOpacityTrackMouseDown(event: MouseEvent) {
  startOpacityDrag(event)
}

// ---------------------------------------------------------------------------
// Lifecycle — keep marker on the active view. The active view is supplied
// by the parent as a reactive prop (driven by an rAF loop that polls
// galavi.getActiveView()), so we don't need to subscribe to galavi here.
// ---------------------------------------------------------------------------

watch(
  () => props.activeView,
  () => {
    if (showTarget.value) syncMarkerVisibility()
  },
)

onBeforeUnmount(() => {
  teardownContrastDrag()
  teardownOpacityDrag()
})
</script>

<style scoped>
.inspector {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--c-border);
  background: var(--c-bg);
  overflow: hidden;
  font-family: var(--font-sans);
}

.panel-header {
  padding: 12px 14px;
  border-bottom: 1px solid var(--c-divider);
}

.panel-header h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-text-muted);
}

.inspector-body {
  padding: 12px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-card {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  background: var(--c-bg-elev);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.card-title {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--c-text-muted);
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* Apply the same uppercase-muted style to *all* labels inside a control-group,
   not only direct children. This keeps "Contrast" (which sits inside a
   label-row wrapper) consistent with siblings like "Channel" and "Show Atlas". */
.control-group label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--c-text-muted);
}

.control-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.scale-toggle {
  display: inline-flex;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--c-bg-soft);
}

.scale-btn {
  appearance: none;
  border: 0;
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 3px 8px;
  cursor: pointer;
}

.scale-btn + .scale-btn {
  border-left: 1px solid var(--c-border);
}

.scale-btn.active {
  background: var(--c-accent-soft);
  color: var(--c-text-strong);
}

.control-group select {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  background: var(--c-bg-soft);
  color: var(--c-text);
  font: inherit;
  font-size: 12px;
}

.range-inputs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 0 6px;
}

.range-slider {
  --start: 0%;
  --end: 100%;
  position: relative;
  width: 100%;
  height: 24px;
  cursor: pointer;
}

.range-track {
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 4px;
  border-radius: 999px;
  transform: translateY(-50%);
  background: var(--c-border-strong);
}

.range-track::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--start);
  right: calc(100% - var(--end));
  border-radius: inherit;
  background: var(--c-accent);
}

.range-thumb {
  position: absolute;
  top: 50%;
  width: 12px;
  height: 12px;
  padding: 0;
  appearance: none;
  -webkit-appearance: none;
  border-radius: 50%;
  border: 1px solid var(--c-bg);
  background: var(--c-text-strong);
  box-shadow: 0 0 0 2px var(--c-accent-strong);
  transform: translate(-50%, -50%);
  cursor: pointer;
}

.range-thumb:hover,
.range-thumb:active { background: var(--c-accent-hover); }

.range-thumb:focus-visible {
  outline: 2px solid var(--c-accent);
  outline-offset: 2px;
}

.range-value {
  color: var(--c-text-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  font-family: var(--font-mono);
}

.switch {
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  background: var(--c-bg-soft);
  color: var(--c-text);
  padding: 8px 10px;
  display: inline-flex;
  align-items: center;
  justify-content: flex-start;
  gap: 10px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.switch-track {
  width: 38px;
  height: 22px;
  border-radius: 999px;
  background: var(--c-border-strong);
  position: relative;
  flex: 0 0 auto;
  transition: background 0.15s ease;
}

.switch-thumb {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: var(--c-text-strong);
  transition: transform 0.15s ease;
}

.switch-copy { font-size: 12px; color: var(--c-text); }
.switch.active .switch-track { background: var(--c-accent); }
.switch-region.active .switch-track { background: var(--c-danger); }
.switch.active .switch-thumb { transform: translateX(16px); background: #fff; }

@media (max-width: 960px) {
  .inspector {
    width: auto;
    border-left: none;
    border-top: 1px solid var(--c-border);
  }
}
</style>

<template>
  <aside class="inspector">
    <div class="panel-header">
      <h2>Inspector</h2>
    </div>
    <div class="inspector-body">
      <section class="control-card">
        <!-- Channel -->
        <div class="control-group">
          <label>Channel</label>
          <select :value="channel" @change="onChannelSelect">
            <option v-for="(ch, idx) in channelOptions" :key="idx" :value="idx">
              {{ ch.label }}
            </option>
          </select>
        </div>

        <!-- Contrast -->
        <div class="control-group">
          <label>Contrast</label>
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
        </div>

        <!-- Show Target -->
        <div class="control-group">
          <label>Show Target</label>
          <button
            type="button"
            class="switch"
            :class="{ active: showTarget }"
            @click="setTargetVisible(!showTarget)"
          >
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-copy">{{ showTarget ? 'Visible on active view' : 'Hidden' }}</span>
          </button>
        </div>

        <!-- Show Atlas -->
        <div class="control-group">
          <label>Show Atlas</label>
          <button
            type="button"
            class="switch switch-region"
            :class="{ active: showAtlas }"
            @click="setAtlasVisible(!showAtlas)"
          >
            <span class="switch-track"><span class="switch-thumb"></span></span>
            <span class="switch-copy">{{ showAtlas ? 'Visible' : 'Hidden' }}</span>
          </button>
        </div>

        <!-- Atlas opacity -->
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
import { useVISoRStore } from '@/stores/visor'
import { REGION_DATA_IDS, SLICE_DEFS } from '@/galavi-setup'

interface Props {
  getGalavi: () => Galavi | undefined
  activeView: string | undefined
  channels: number[]
  channel: number
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

const visorStore = useVISoRStore()

// ---------------------------------------------------------------------------
// Channel options (with marker / wavelength)
// ---------------------------------------------------------------------------

const channelOptions = computed(() =>
  props.channels.map((idx) => {
    const meta = visorStore.availableChannels[idx]
    const label = meta
      ? `${meta.marker} (${meta.wavelength}nm)`
      : `Channel ${idx}`
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
// ---------------------------------------------------------------------------

const contrastSlider = ref<HTMLDivElement | null>(null)
const activeContrastThumb = ref<'min' | 'max' | null>(null)
let stopContrastDrag: (() => void) | undefined

const contrastSpan = computed(() =>
  Math.max(props.contrastBounds[1] - props.contrastBounds[0], props.contrastStep),
)

function clampContrastValue(value: number): number {
  return Math.max(props.contrastBounds[0], Math.min(props.contrastBounds[1], value))
}

function snapContrastValue(value: number): number {
  const steps = Math.round((clampContrastValue(value) - props.contrastBounds[0]) / props.contrastStep)
  return clampContrastValue(props.contrastBounds[0] + steps * props.contrastStep)
}

function getContrastPercent(value: number): number {
  return ((clampContrastValue(value) - props.contrastBounds[0]) / contrastSpan.value) * 100
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
  return snapContrastValue(props.contrastBounds[0] + ratio * contrastSpan.value)
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
  border-left: 1px solid rgba(158, 176, 201, 0.14);
  background: rgba(19, 24, 31, 0.92);
  overflow: hidden;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
}

.panel-header {
  padding: 12px 14px;
  border-bottom: 1px solid rgba(158, 176, 201, 0.1);
}

.panel-header h2 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #95a6ba;
}

.inspector-body {
  padding: 12px;
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-card {
  border: 1px solid rgba(158, 176, 201, 0.1);
  border-radius: 12px;
  background: rgba(11, 15, 21, 0.56);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-group > label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: #9aa6b6;
}

.control-group select {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid rgba(158, 176, 201, 0.16);
  border-radius: 8px;
  background: rgba(19, 24, 31, 0.9);
  color: #d9e1ea;
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
  background: #2c3138;
}

.range-track::before {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  left: var(--start);
  right: calc(100% - var(--end));
  border-radius: inherit;
  background: #6ea8ff;
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
  border: 1px solid #11161d;
  background: #d8e3f1;
  box-shadow: 0 0 0 2px rgba(110, 168, 255, 0.25);
  transform: translate(-50%, -50%);
  cursor: pointer;
}

.range-thumb:hover,
.range-thumb:active { background: #eef4fb; }

.range-thumb:focus-visible {
  outline: 2px solid rgba(110, 168, 255, 0.9);
  outline-offset: 2px;
}

.range-value {
  color: #90a2b6;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.switch {
  border: 1px solid rgba(158, 176, 201, 0.16);
  border-radius: 10px;
  background: rgba(19, 24, 31, 0.9);
  color: #d9e1ea;
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
  background: rgba(98, 111, 127, 0.5);
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
  background: #eef3f8;
  transition: transform 0.15s ease;
}

.switch-copy { font-size: 12px; color: #d9e1ea; }
.switch.active .switch-track { background: rgba(84, 153, 255, 0.8); }
.switch-region.active .switch-track { background: rgba(230, 50, 50, 0.8); }
.switch.active .switch-thumb { transform: translateX(16px); }

@media (max-width: 960px) {
  .inspector {
    width: auto;
    border-left: none;
    border-top: 1px solid rgba(158, 176, 201, 0.14);
  }
}
</style>

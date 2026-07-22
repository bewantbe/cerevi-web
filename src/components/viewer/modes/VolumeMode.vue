<template>
  <div class="volume-mode" @pointermove="onPointerMove" @pointerleave="onPointerLeave">
    <canvas ref="mainCanvas" class="main-canvas"></canvas>

    <div class="navigator-overlay" aria-label="Navigator">
      <canvas ref="navigatorCanvas"></canvas>
    </div>
    <div class="camera-mode" role="group" aria-label="Camera control">
      <button type="button" :class="{ active: liveState?.exploration.camera.navMode === 'orbit' }" title="Orbit camera" aria-label="Orbit camera" @click="setCameraMode('orbit')">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M13.6 8a5.6 5.6 0 1 1-1.7-4" />
          <path d="M13.8 1.6v2.6h-2.6" />
        </svg>
      </button>
      <button type="button" :class="{ active: liveState?.exploration.camera.navMode === 'fly' }" title="Fly camera" aria-label="Fly camera" @click="setCameraMode('fly')">
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M14.3 1.7 9.8 14.3 7.4 8.6 1.7 6.2Z" />
          <path d="M14.3 1.7 7.4 8.6" />
        </svg>
      </button>
    </div>

    <div v-if="!instance" class="mode-loading">Preparing volume...</div>
  </div>
</template>

<script setup lang="ts">
import { screenToVolumeTargetPlane, volumeUnitsPerPixel, type Galavi, type State } from 'galavi'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { bootstrap, channelColor, physicalFraming, type SetupContext } from '@/galavi-setup'
import { useVISoRStore } from '@/stores/visor'

const props = defineProps<{ ctx: SetupContext }>()
const store = useVISoRStore()
const mainCanvas = ref<HTMLCanvasElement | null>(null)
const navigatorCanvas = ref<HTMLCanvasElement | null>(null)
const instance = ref<Galavi | null>(null)
const liveState = ref<State | null>(null)
let unsubscribe: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined
let mainToken = 0

const unit = computed(() => physicalFraming(props.ctx).unit)

function measure() {
  instance.value?.requestRender()
}

function updateReadouts(state: State) {
  liveState.value = state
  const target = state.exploration.camera.target
  const height = mainCanvas.value?.clientHeight ?? 0
  const cameraResolution = height > 0 ? volumeUnitsPerPixel(state.exploration.camera, height) : 0
  const viewResolution = instance.value?.view('volume').getResolution('volume')?.unitsPerPixel
  const resolution = viewResolution && viewResolution > 0 ? viewResolution : cameraResolution
  const positionLabel = `${target[0].toFixed(1)}, ${target[1].toFixed(1)}, ${target[2].toFixed(1)} ${unit.value}`
  const resolutionLabel = resolution > 0 ? `${resolution.toFixed(2)} ${unit.value}/px` : '—'
  store.setReadouts(positionLabel, resolutionLabel)
}

function applyImagery() {
  const galavi = instance.value
  if (!galavi) return
  const color = channelColor(props.ctx, store.channel)
  galavi.layer('volume')?.setOptions({ selection: { c: store.channel } })
  galavi.layer('volume')?.setRender({ color, contrastLimits: store.contrastForSource('volume', store.channel) })
  // Mesh layers tint with the channel color too (navigator surface + region mesh).
  galavi.layer('surface')?.setRender({ color })
  galavi.layer('regionSurface')?.setRender({ color })
}

/** Push store tool/selection/cursor state into the galavi overlay options. */
function syncOverlayOptions() {
  const galavi = instance.value
  if (!galavi) return
  const cursor = store.cursorPosition
  galavi.view('volume').setOverlayOptions('ruler', {
    visible: store.isToolEnabled('ruler'),
    unit: unit.value,
    resetNonce: store.rulerResetNonce,
  })
  galavi.view('volume').setOverlayOptions('roiselector', {
    visible: Boolean(store.selection),
    enabled: false,
    roi: store.selection,
    unit: unit.value,
  })
  galavi.view('volume').setOverlayOptions('magnifier', {
    visible: store.isToolEnabled('magnifier') && Boolean(cursor),
    position: cursor,
  })
}

async function build() {
  if (!mainCanvas.value || !navigatorCanvas.value) return
  const currentToken = ++mainToken
  await nextTick()
  const galavi = await bootstrap(
    props.ctx,
    mainCanvas.value,
    { navigator: navigatorCanvas.value },
    'volume',
    ['navigator'],
  )
  if (currentToken !== mainToken) {
    galavi.destroy()
    return
  }
  instance.value = galavi
  galavi.setActiveView('volume')
  unsubscribe = galavi.subscribe(updateReadouts)
  updateReadouts(galavi.getState())
  applyImagery()
  syncOverlayOptions()
  measure()
}

function onPointerMove(event: PointerEvent) {
  const canvas = mainCanvas.value
  const state = liveState.value
  if (!canvas || !state || event.target === navigatorCanvas.value) return
  const bounds = canvas.getBoundingClientRect()
  const position = screenToVolumeTargetPlane(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    state.exploration.camera,
    bounds.width,
    bounds.height,
  )
  if (position) store.setCursor(position)
}

function onPointerLeave() {
  store.setCursor(null)
}

function setCameraMode(mode: 'orbit' | 'fly') {
  instance.value?.setNavMode(mode)
}

onMounted(() => {
  void build()
  resizeObserver = new ResizeObserver(measure)
  if (mainCanvas.value) resizeObserver.observe(mainCanvas.value)
})

onBeforeUnmount(() => {
  mainToken += 1
  unsubscribe?.()
  resizeObserver?.disconnect()
  instance.value?.destroy()
  store.setCursor(null)
  store.clearReadouts()
})

watch(() => [store.channel, store.contrastMin, store.contrastMax], applyImagery)
watch(
  () => [
    store.cursorPosition,
    store.selection,
    store.rulerResetNonce,
    store.enabledTools.ruler,
    store.enabledTools.magnifier,
  ],
  syncOverlayOptions,
)
</script>

<style scoped>
.volume-mode { position: absolute; inset: 0; overflow: hidden; background: #000; }
.main-canvas { display: block; width: 100%; height: 100%; }
.navigator-overlay { position: absolute; z-index: 20; top: 16px; left: 16px; width: clamp(140px, 17vw, 220px); aspect-ratio: 1; overflow: hidden; border: 1px solid var(--galavi-border); border-radius: var(--radius-sm); background: #000; box-shadow: var(--shadow-lg); }
.navigator-overlay canvas { display: block; width: 100%; height: 100%; }
.camera-mode { position: absolute; z-index: 40; top: calc(24px + clamp(140px, 17vw, 220px)); left: 16px; display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--galavi-border); border-radius: var(--radius-sm); background: var(--galavi-panel-bg); }
.camera-mode button { display: inline-flex; width: 30px; height: 27px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 2px; background: transparent; color: var(--galavi-text-dim); cursor: pointer; }
.camera-mode button:hover { color: var(--galavi-text); }
.camera-mode button.active { background: var(--galavi-accent-soft); color: var(--galavi-accent); }
.mode-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--galavi-text-dim); background: var(--app-bg); }
</style>

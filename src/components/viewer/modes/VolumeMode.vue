<template>
  <div class="volume-mode" @pointermove="onPointerMove" @pointerleave="onPointerLeave">
    <canvas ref="mainCanvas" class="main-canvas"></canvas>

    <div class="navigator-overlay" aria-label="Navigator">
      <canvas ref="navigatorCanvas"></canvas>
    </div>

    <div v-if="!instance" class="mode-loading">Preparing volume...</div>
  </div>
</template>

<script setup lang="ts">
import { screenToVolumeTargetPlane, volumeUnitsPerPixel, type Galavi, type State } from 'galavi'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { bootstrap, channelColor, physicalFraming, type SetupContext } from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'

const props = defineProps<{ ctx: SetupContext }>()
const store = useCereviStore()
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
  // Reflect the live camera nav mode back so NavModeBlock stays in sync
  // (galavi flips it on some interactions); guard against feedback loops.
  if (state.exploration.camera.navMode !== store.navMode) {
    store.setNavMode(state.exploration.camera.navMode)
  }
  const target = state.exploration.camera.target
  store.setCenter(target)
  const height = mainCanvas.value?.clientHeight ?? 0
  const cameraResolution = height > 0 ? volumeUnitsPerPixel(state.exploration.camera, height) : 0
  const viewResolution = instance.value?.view('volume').getResolution('volume')?.unitsPerPixel
  const resolution = viewResolution && viewResolution > 0 ? viewResolution : cameraResolution
  const resolutionLabel = resolution > 0 ? `${resolution.toFixed(2)} ${unit.value}/px` : '—'
  store.setResolutionReadout(resolutionLabel)
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
    visible: store.selections.length > 0,
    enabled: false,
    rois: store.selections,
    activeIndex: store.activeSelectionIndex,
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
  galavi.setNavMode(store.navMode)
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

onMounted(() => {
  void build()
  resizeObserver = new ResizeObserver(measure)
  if (mainCanvas.value) resizeObserver.observe(mainCanvas.value)
  if (navigatorCanvas.value) resizeObserver.observe(navigatorCanvas.value)
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
watch(() => store.navMode, (mode) => instance.value?.setNavMode(mode), { immediate: true })
watch(
  () => [
    store.cursorPosition,
    store.selections,
    store.activeSelectionIndex,
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
.navigator-overlay { position: absolute; z-index: 20; top: 16px; right: 42px; width: clamp(140px, 17vw, 220px); aspect-ratio: 1; overflow: hidden; border: 1px solid var(--galavi-border); background: #000; box-shadow: 0 0 16px var(--galavi-accent-soft), var(--shadow-lg); clip-path: polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px)); }
.navigator-overlay canvas { display: block; width: 100%; height: 100%; }
.mode-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--galavi-text-dim); background: var(--app-bg); }
</style>

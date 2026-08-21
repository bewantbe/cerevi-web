<template>
  <div class="volume-mode" @pointermove="onPointerMove" @pointerleave="onPointerLeave">
    <canvas ref="mainCanvas" class="main-canvas"></canvas>

    <div class="navigator-overlay" aria-label="Navigator">
      <canvas ref="navigatorCanvas"></canvas>
    </div>

    <div v-if="!instance" class="mode-loading" :class="{ 'mode-error': buildError }">
      {{ buildError ?? 'Preparing volume...' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { screenToVolumeTargetPlane, type LayerPatch, type State, type ViewerEngine } from 'galavi/advanced'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  describeBuildError,
  formatResolutionReadout,
  syncViewOverlays,
  useGalaviSession,
  viewUnitsPerPixel,
  volumeCameraResolution,
} from '@/composables/useGalaviSession'
import { bootstrap, channelColor, physicalFraming, type SetupContext } from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'

const props = defineProps<{ ctx: SetupContext }>()
const store = useCereviStore()
const mainCanvas = ref<HTMLCanvasElement | null>(null)
const navigatorCanvas = ref<HTMLCanvasElement | null>(null)
const instance = shallowRef<ViewerEngine | null>(null)
const buildError = ref<string | null>(null)
const liveState = ref<State | null>(null)
const session = useGalaviSession()

const unit = computed(() => physicalFraming(props.ctx).unit)

function updateReadouts(state: State) {
  liveState.value = state
  // Reflect the live camera nav mode back so NavModeBlock stays in sync
  // (galavi flips it on some interactions); guard against feedback loops.
  if (state.exploration.camera.navMode !== store.navMode) {
    store.setNavMode(state.exploration.camera.navMode)
  }
  const target = state.exploration.camera.target
  store.setCenter(target)
  store.setResolutionReadout(
    formatResolutionReadout(
      viewUnitsPerPixel(instance.value, 'volume', 'volume'),
      volumeCameraResolution(state, mainCanvas.value),
      unit.value,
    ),
  )
}

function applyImagery() {
  const engine = instance.value
  if (!engine) return
  const color = channelColor(props.ctx, store.channel)
  const patches: LayerPatch[] = [{
    id: 'volume',
    options: { selection: { c: store.channel } },
    render: { color, contrastLimits: store.contrastForSource('volume', store.channel) },
  }]
  if (props.ctx.hasMesh) {
    // Mesh layers tint with the channel color too (navigator surface + region mesh).
    patches.push({ id: 'surface', render: { color } }, { id: 'regionSurface', render: { color } })
  }
  engine.updateLayers(patches)
}

/** Per-mode overlay spec; the shared rules live in syncViewOverlays. */
function syncOverlayOptions() {
  const engine = instance.value
  if (!engine) return
  syncViewOverlays(engine, store, unit.value, [
    { view: 'volume', ruler: true, rois: { enabled: false }, magnifier: true },
  ])
}

async function build() {
  if (!mainCanvas.value || !navigatorCanvas.value) return
  const token = session.nextBuildToken()
  await nextTick()
  let engine: ViewerEngine
  try {
    engine = await bootstrap(
      props.ctx,
      mainCanvas.value,
      { navigator: navigatorCanvas.value },
      'volume',
      ['navigator'],
    )
  } catch (err) {
    if (session.isBuildCurrent(token)) {
      console.error('[volume] session build failed:', err)
      buildError.value = describeBuildError(err)
    }
    return
  }
  if (!session.isBuildCurrent(token)) {
    engine.destroy()
    return
  }
  instance.value = engine
  buildError.value = null
  engine.setActiveView('volume')
  engine.setNavMode(store.navMode)
  session.subscribeTo(engine, updateReadouts)
  updateReadouts(engine.getState())
  applyImagery()
  syncOverlayOptions()
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
})

onBeforeUnmount(() => session.teardownSession(instance.value, store))

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
.mode-error { padding: 24px; color: var(--galavi-warn); text-align: center; }
</style>

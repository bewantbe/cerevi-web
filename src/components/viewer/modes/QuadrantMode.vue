<template>
  <div class="quadrant-mode">
    <section class="quadrant-cell volume-cell diagonal-box" :class="{ active: activeView === 'volume' }" @pointerdown="activateTopView">
      <canvas ref="topCanvas" class="cell-canvas"></canvas>
      <div class="navigator-overlay diagonal-box" aria-label="Navigator">
        <canvas ref="navigatorCanvas"></canvas>
      </div>
      <span class="cell-label">3D</span>
      <span class="active-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </section>

    <section
      v-for="plane in planes"
      :key="plane"
      class="quadrant-cell slice-cell diagonal-box"
      :class="[`plane-${plane}`, { active: activeView === plane }]"
      @pointerdown="activateSlice(plane)"
      @pointermove="onSlicePointerMove(plane, $event)"
      @pointerleave="onSlicePointerLeave(plane)"
      @dblclick="recenterFromEvent(plane, $event)"
    >
      <canvas :ref="(element) => setSliceCanvas(plane, element as HTMLCanvasElement | null)" class="cell-canvas"></canvas>
      <span class="cell-label">{{ planeLabel(plane) }}</span>
      <span class="active-corners" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
    </section>

    <div v-if="!instance" class="mode-loading">Preparing synchronized views...</div>
  </div>
</template>

<script setup lang="ts">
import { type Galavi, type State, type Vec3 } from 'galavi'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  formatResolutionReadout,
  pointerToSlicePhysical,
  sliceCameraResolution,
  syncViewOverlays,
  useGalaviSession,
  vec3Differ,
  viewUnitsPerPixel,
  volumeCameraResolution,
  watchCenterEcho,
} from '@/composables/useGalaviSession'
import {
  bootstrap,
  channelColor,
  imagerySourceForPlane,
  physicalFraming,
  planeLabel,
  sliceDef,
  storageSliceIndex,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'

const props = defineProps<{ ctx: SetupContext }>()
const store = useCereviStore()
const planes: SlicePlane[] = ['xy', 'xz', 'yz']
const topCanvas = ref<HTMLCanvasElement | null>(null)
const navigatorCanvas = ref<HTMLCanvasElement | null>(null)
const sliceCanvases: Partial<Record<SlicePlane, HTMLCanvasElement | null>> = {}
const instance = shallowRef<Galavi | null>(null)
const liveState = ref<State | null>(null)
const activeView = ref<'volume' | SlicePlane>('xy')
const hoveredPlane = ref<SlicePlane | null>(null)
const session = useGalaviSession()

const unit = computed(() => physicalFraming(props.ctx).unit)

function setSliceCanvas(plane: SlicePlane, canvas: HTMLCanvasElement | null) {
  sliceCanvases[plane] = canvas
}

function updateLive(state: State) {
  liveState.value = state
  if (vec3Differ(state.exploration.camera.target, store.centerPosition)) {
    store.setCenter(state.exploration.camera.target)
  }
  const activeViewName = (instance.value?.getActiveView() ?? 'volume') as 'volume' | SlicePlane
  activeView.value = activeViewName
  const layerId = activeViewName === 'volume' ? 'volume' : sliceDef(props.ctx, activeViewName).layerId
  const cameraResolution =
    activeViewName === 'volume'
      ? volumeCameraResolution(state, topCanvas.value)
      : sliceCameraResolution(state, sliceCanvases[activeViewName])
  store.setResolutionReadout(
    formatResolutionReadout(viewUnitsPerPixel(instance.value, activeViewName, layerId), cameraResolution, unit.value),
  )
}

function applySlices() {
  const galavi = instance.value
  if (!galavi) return
  for (const plane of planes) {
    const definition = sliceDef(props.ctx, plane)
    galavi.layer(definition.layerId)?.setOptions({
      sliceIndex: storageSliceIndex(props.ctx, plane, store.sliceByPlane[plane]),
    })
  }
}

function applyImagery() {
  const galavi = instance.value
  if (!galavi) return
  const color = channelColor(props.ctx, store.channel)
  galavi.layer('volume')?.setOptions({ selection: { c: store.channel } })
  galavi.layer('volume')?.setRender({ color, contrastLimits: store.contrastForSource('volume', store.channel) })
  for (const plane of planes) {
    const definition = sliceDef(props.ctx, plane)
    galavi.layer(definition.layerId)?.setOptions({ selection: { c: store.channel } })
    galavi.layer(definition.layerId)?.setRender({
      color,
      contrastLimits: store.contrastForPlane(plane, store.channel),
    })
    // Region mesh contours follow the channel color too.
    galavi.layer(definition.regionShapesId)?.setRender({ color })
  }
  // Mesh layers tint with the channel color (navigator surface + region mesh).
  galavi.layer('surface')?.setRender({ color })
  galavi.layer('regionSurface')?.setRender({ color })
}

/** Per-mode overlay spec; the shared rules live in syncViewOverlays. */
function syncOverlayOptions() {
  const galavi = instance.value
  if (!galavi) return
  syncViewOverlays(galavi, store, unit.value, [
    // Volume cell: read-only ROI wireframe (ruler/magnifier stay hidden here).
    { view: 'volume', rois: { enabled: false } },
    ...planes.map((plane) => ({
      view: plane as string,
      crosshair: true,
      ruler: activeView.value === plane,
      rois: { enabled: store.isToolEnabled('selector'), plane },
      magnifier: hoveredPlane.value === plane,
    })),
  ])
}

async function build() {
  if (!topCanvas.value || !navigatorCanvas.value || planes.some((plane) => !sliceCanvases[plane])) return
  const token = session.nextBuildToken()
  await nextTick()
  // The navigator is a view inside the shared session (same pattern as
  // VolumeMode) so its camera follows the unified volume camera for free.
  const galavi = await bootstrap(
    props.ctx,
    topCanvas.value,
    {
      ...Object.fromEntries(planes.map((plane) => [plane, sliceCanvases[plane]!])),
      navigator: navigatorCanvas.value,
    },
    'volume',
    [...planes, 'navigator'],
  )
  if (!session.isBuildCurrent(token)) {
    galavi.destroy()
    return
  }
  instance.value = galavi
  galavi.setActiveView('xy')
  activeView.value = 'xy'
  store.setActiveImagerySource(imagerySourceForPlane(props.ctx, 'xy'))
  galavi.setTarget(store.centerPosition)
  session.subscribeTo(galavi, updateLive)
  applySlices()
  applyImagery()
  syncOverlayOptions()
  updateLive(galavi.getState())
}

function activateTopView() {
  activeView.value = 'volume'
  store.setActiveImagerySource('volume')
  instance.value?.setActiveView('volume')
  syncOverlayOptions()
}

function activateSlice(plane: SlicePlane) {
  activeView.value = plane
  store.setActiveImagerySource(imagerySourceForPlane(props.ctx, plane))
  instance.value?.setActiveView(plane)
  syncOverlayOptions()
}

function eventPosition(plane: SlicePlane, event: PointerEvent | MouseEvent): Vec3 | null {
  return pointerToSlicePhysical(
    event,
    sliceCanvases[plane],
    liveState.value,
    sliceDef(props.ctx, plane).axisMap,
    store.positionForSlice(plane, store.sliceByPlane[plane]),
  )
}

function onSlicePointerMove(plane: SlicePlane, event: PointerEvent) {
  const position = eventPosition(plane, event)
  if (!position) return
  hoveredPlane.value = plane
  store.setCursor(position)
}

function onSlicePointerLeave(plane: SlicePlane) {
  if (hoveredPlane.value !== plane) return
  hoveredPlane.value = null
  store.setCursor(null)
}

function recenterFromEvent(plane: SlicePlane, event: MouseEvent) {
  if (!store.isToolEnabled('selector')) return
  const position = eventPosition(plane, event)
  if (position) store.setCenter(position)
}

onMounted(async () => {
  await nextTick()
  void build()
})

onBeforeUnmount(() => session.teardownSession(instance.value, store))

watchCenterEcho(store, () => instance.value)
watch(() => planes.map((plane) => store.sliceByPlane[plane]).join(':'), applySlices)
watch(() => [store.channel, store.contrastMin, store.contrastMax], applyImagery)
watch(
  () => [
    store.cursorPosition,
    store.selections,
    store.activeSelectionIndex,
    store.rulerResetNonce,
    store.enabledTools.ruler,
    store.enabledTools.crosshair,
    store.enabledTools.magnifier,
    store.enabledTools.selector,
    hoveredPlane.value,
  ],
  syncOverlayOptions,
)
</script>

<style scoped>
.quadrant-mode { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 5px; overflow: hidden; background: #000; }
.quadrant-cell { --diagonal-cut: 9px; position: relative; min-width: 0; min-height: 0; overflow: hidden; }
.volume-cell { grid-column: 1; grid-row: 1; }
.plane-xy { grid-column: 2; grid-row: 1; }
.plane-yz { grid-column: 1; grid-row: 2; }
.plane-xz { grid-column: 2; grid-row: 2; }
.cell-canvas { display: block; width: 100%; height: 100%; }
.cell-label { position: absolute; z-index: 20; right: 10px; bottom: 9px; padding: 3px 7px; border-radius: 2px; background: var(--galavi-panel-bg); color: var(--galavi-text); font: 600 11px var(--galavi-font-mono); letter-spacing: 0.08em; text-transform: uppercase; pointer-events: none; }
.active-corners { position: absolute; z-index: 40; inset: 8px; display: block; opacity: 0; pointer-events: none; transition: opacity 120ms ease; }
.quadrant-cell.active .active-corners { opacity: 1; }
.active-corners i { position: absolute; width: 19px; height: 19px; border-color: var(--galavi-accent); filter: drop-shadow(0 0 4px var(--galavi-accent-soft)); }
.active-corners i:nth-child(1) { top: 0; left: 0; border-top: 2px solid var(--galavi-accent); border-left: 2px solid var(--galavi-accent); }
.active-corners i:nth-child(2) { top: 0; right: 0; border-top: 2px solid var(--galavi-accent); border-right: 2px solid var(--galavi-accent); }
.active-corners i:nth-child(3) { right: 0; bottom: 0; border-right: 2px solid var(--galavi-accent); border-bottom: 2px solid var(--galavi-accent); }
.active-corners i:nth-child(4) { bottom: 0; left: 0; border-bottom: 2px solid var(--galavi-accent); border-left: 2px solid var(--galavi-accent); }
.navigator-overlay { --diagonal-cut: 9px; position: absolute; z-index: 30; top: 10px; right: 34px; width: clamp(110px, 13vw, 170px); aspect-ratio: 1; overflow: hidden; box-shadow: 0 0 14px var(--galavi-accent-soft), var(--shadow-lg); pointer-events: none; }
.navigator-overlay canvas { display: block; width: 100%; height: 100%; }
.mode-loading { position: absolute; inset: 0; z-index: 80; display: grid; place-items: center; color: var(--galavi-text-dim); background: var(--app-bg); }
</style>

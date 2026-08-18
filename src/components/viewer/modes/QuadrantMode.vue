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
      :class="[`plane-${plane}`, { active: activeView === plane, 'magnifier-2d-active': store.magnifierMode === '2d', 'magnifier-3d-active': store.magnifierMode === '3d' }]"
      @pointerdown="activateSlice(plane)"
      @pointermove="onSlicePointerMove(plane, $event)"
      @pointerleave="onSlicePointerLeave(plane)"
      @click="pinMagnifierFromEvent(plane, $event)"
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
import { type LayerPatch, type State, type Vec3, type ViewerEngine } from 'galavi/advanced'
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
const instance = shallowRef<ViewerEngine | null>(null)
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
  const engine = instance.value
  if (!engine) return
  engine.updateLayers(planes.map((plane) => ({
    id: sliceDef(props.ctx, plane).layerId,
    options: { sliceIndex: storageSliceIndex(props.ctx, plane, store.sliceByPlane[plane]) },
  })))
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
  for (const plane of planes) {
    const definition = sliceDef(props.ctx, plane)
    patches.push({
      id: definition.layerId,
      options: { selection: { c: store.channel } },
      render: { color, contrastLimits: store.contrastForPlane(plane, store.channel) },
    })
    if (props.ctx.hasMesh) {
      // Region mesh contours follow the channel color too.
      patches.push({ id: definition.regionShapesId, render: { color } })
    }
  }
  if (props.ctx.hasMesh) {
    // Mesh layers tint with the channel color (navigator surface + region mesh).
    patches.push({ id: 'surface', render: { color } }, { id: 'regionSurface', render: { color } })
  }
  engine.updateLayers(patches)
}

/** Per-mode overlay spec; the shared rules live in syncViewOverlays. */
function syncOverlayOptions() {
  const engine = instance.value
  if (!engine) return
  syncViewOverlays(engine, store, unit.value, [
    // Volume cell: read-only ROI wireframe (ruler/magnifier stay hidden here).
    { view: 'volume', rois: { enabled: false } },
    ...planes.map((plane) => ({
      view: plane as string,
      crosshair: true,
      ruler: activeView.value === plane,
      rois: { enabled: store.isToolEnabled('selector'), plane },
      magnifier: store.magnifierMode === '3d'
        ? store.magnifier3dPlane === plane
        : hoveredPlane.value === plane,
      magnifierPlane: plane,
    })),
  ])
}

async function build() {
  if (!topCanvas.value || !navigatorCanvas.value || planes.some((plane) => !sliceCanvases[plane])) return
  const token = session.nextBuildToken()
  await nextTick()
  // The navigator is a view inside the shared session (same pattern as
  // VolumeMode) so its camera follows the unified volume camera for free.
  const engine = await bootstrap(
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
    engine.destroy()
    return
  }
  instance.value = engine
  engine.setActiveView('xy')
  activeView.value = 'xy'
  store.setActiveImagerySource(imagerySourceForPlane(props.ctx, 'xy'))
  engine.setTarget(store.centerPosition)
  session.subscribeTo(engine, updateLive)
  applySlices()
  applyImagery()
  syncOverlayOptions()
  updateLive(engine.getState())
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

function pinMagnifierFromEvent(plane: SlicePlane, event: MouseEvent) {
  if (store.magnifierMode !== '3d' || event.target !== sliceCanvases[plane]) return
  const position = eventPosition(plane, event)
  if (!position) return
  store.pinMagnifier3d(position, plane)
  const color = channelColor(props.ctx, store.channel)
  instance.value?.updateLayers([{
    id: 'volume',
    options: { selection: { c: store.channel } },
    render: {
      visible: true,
      color,
      contrastLimits: store.contrastForPlane(plane, store.channel),
    },
  }])
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
    store.magnifierMode,
    store.magnifier3dPosition,
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
.slice-cell.magnifier-2d-active .cell-canvas { cursor: none; }
.slice-cell.magnifier-3d-active .cell-canvas {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Ccircle cx='8' cy='8' r='5' fill='%23040b0f' stroke='%235ce9ff' stroke-width='1.5'/%3E%3Cpath d='M12 12l5 5' stroke='%235ce9ff' stroke-width='1.5'/%3E%3Ctext x='6.2' y='10.4' font-size='7' fill='%235ce9ff'%3E3%3C/text%3E%3C/svg%3E") 8 8, zoom-in;
}
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

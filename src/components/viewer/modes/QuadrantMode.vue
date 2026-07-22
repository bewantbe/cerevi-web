<template>
  <div class="quadrant-mode">
    <section class="quadrant-cell volume-cell" @pointerdown="activateTopView">
      <canvas ref="topCanvas" class="cell-canvas"></canvas>
      <div class="navigator-overlay" aria-label="Navigator">
        <canvas ref="navigatorCanvas"></canvas>
      </div>
      <span class="cell-label">3D Volume</span>
    </section>

    <section
      v-for="plane in planes"
      :key="plane"
      class="quadrant-cell slice-cell"
      @pointerdown="activateSlice(plane)"
      @pointermove="onSlicePointerMove(plane, $event)"
      @pointerleave="onSlicePointerLeave(plane)"
      @dblclick="recenterFromEvent(plane, $event)"
    >
      <canvas :ref="(element) => setSliceCanvas(plane, element as HTMLCanvasElement | null)" class="cell-canvas"></canvas>
      <span class="cell-label">{{ planeLabel(plane) }}</span>
    </section>

    <div v-if="!instance" class="mode-loading">Preparing synchronized views...</div>
  </div>
</template>

<script setup lang="ts">
import { cameraDistance, screenToSlicePhysical, volumeUnitsPerPixel, type Galavi, type State, type Vec3 } from 'galavi'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  bootstrap,
  buildNavigatorOverview,
  channelColor,
  imagerySourceForPlane,
  physicalFraming,
  planeLabel,
  sliceDef,
  storageSliceIndex,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'
import { useVISoRStore } from '@/stores/visor'

const props = defineProps<{ ctx: SetupContext }>()
const store = useVISoRStore()
const planes: SlicePlane[] = ['xy', 'xz', 'yz']
const topCanvas = ref<HTMLCanvasElement | null>(null)
const navigatorCanvas = ref<HTMLCanvasElement | null>(null)
const sliceCanvases: Partial<Record<SlicePlane, HTMLCanvasElement | null>> = {}
const instance = ref<Galavi | null>(null)
const liveState = ref<State | null>(null)
const activeSlice = ref<SlicePlane>('xy')
const hoveredPlane = ref<SlicePlane | null>(null)

let mainToken = 0
let navigatorToken = 0
let navigatorInstance: Galavi | undefined
let unsubscribe: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined

const unit = computed(() => physicalFraming(props.ctx).unit)

function setSliceCanvas(plane: SlicePlane, canvas: HTMLCanvasElement | null) {
  sliceCanvases[plane] = canvas
}

function measure() {
  instance.value?.requestRender()
}

function targetsDiffer(first: Vec3, second: Vec3): boolean {
  return first.some((value, axis) => Math.abs(value - second[axis]) > 1e-5)
}

function updateLive(state: State) {
  liveState.value = state
  if (targetsDiffer(state.exploration.camera.target, store.centerPosition)) {
    store.setCenter(state.exploration.camera.target)
  }
  const activeView = instance.value?.getActiveView() ?? 'xy'
  const layerId = activeView === 'volume' ? 'volume' : sliceDef(props.ctx, activeView as SlicePlane).layerId
  const viewResolution = instance.value?.view(activeView).getResolution(layerId)?.unitsPerPixel

  let cameraResolution = 0
  if (activeView === 'volume') {
    const height = topCanvas.value?.clientHeight ?? 0
    if (height > 0) cameraResolution = volumeUnitsPerPixel(state.exploration.camera, height)
  } else {
    const plane = activeView as SlicePlane
    const canvas = sliceCanvases[plane]
    const height = canvas?.clientHeight ?? 0
    if (height > 0) cameraResolution = cameraDistance(state.exploration.camera) / height
  }

  const resolution = viewResolution && viewResolution > 0 ? viewResolution : cameraResolution
  const target = state.exploration.camera.target
  store.setReadouts(
    `${target[0].toFixed(1)}, ${target[1].toFixed(1)}, ${target[2].toFixed(1)} ${unit.value}`,
    resolution > 0 ? `${resolution.toFixed(2)} ${unit.value}/px` : '—',
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

/** Push store tool/selection/cursor state into the galavi overlay options. */
function syncOverlayOptions() {
  const galavi = instance.value
  if (!galavi) return
  const cursor = store.cursorPosition
  const selectorActive = store.isToolEnabled('selector')
  // Volume cell: read-only ROI wireframe (ruler/magnifier stay hidden here).
  galavi.view('volume').setOverlayOptions('roiselector', {
    visible: Boolean(store.selection),
    enabled: false,
    roi: store.selection,
    unit: unit.value,
  })
  for (const plane of planes) {
    const view = galavi.view(plane)
    view.setOverlayOptions('crosshair', {
      visible: store.isToolEnabled('crosshair') && Boolean(cursor),
      ...(cursor ? { position: cursor } : {}),
    })
    view.setOverlayOptions('ruler', {
      visible: store.isToolEnabled('ruler') && activeSlice.value === plane,
      unit: unit.value,
      resetNonce: store.rulerResetNonce,
    })
    view.setOverlayOptions('roiselector', {
      visible: selectorActive || Boolean(store.selection),
      enabled: selectorActive,
      roi: store.selection,
      unit: unit.value,
      onRoiChange: (roi: { min: Vec3; max: Vec3 }) => store.setSelection(roi),
    })
    view.setOverlayOptions('magnifier', {
      visible: store.isToolEnabled('magnifier') && hoveredPlane.value === plane && Boolean(cursor),
      position: hoveredPlane.value === plane ? cursor : null,
    })
  }
}

async function buildNavigator() {
  if (!navigatorCanvas.value) return
  const currentToken = ++navigatorToken
  navigatorInstance?.destroy()
  navigatorInstance = undefined
  await nextTick()
  if (currentToken !== navigatorToken || !navigatorCanvas.value) return
  navigatorInstance = await buildNavigatorOverview({
    ctx: props.ctx,
    plane: store.plane,
    canvas: navigatorCanvas.value,
    channel: store.channel,
    color: channelColor(props.ctx, store.channel),
  })
  if (currentToken !== navigatorToken) {
    navigatorInstance.destroy()
    navigatorInstance = undefined
  }
}

async function build() {
  if (!topCanvas.value || planes.some((plane) => !sliceCanvases[plane])) return
  const currentToken = ++mainToken
  await nextTick()
  const galavi = await bootstrap(
    props.ctx,
    topCanvas.value,
    Object.fromEntries(planes.map((plane) => [plane, sliceCanvases[plane]!])),
    'volume',
    planes,
  )
  if (currentToken !== mainToken) {
    galavi.destroy()
    return
  }
  instance.value = galavi
  galavi.setActiveView('volume')
  galavi.setTarget(store.centerPosition)
  unsubscribe = galavi.subscribe(updateLive)
  applySlices()
  applyImagery()
  syncOverlayOptions()
  void buildNavigator()
  updateLive(galavi.getState())
  measure()
}

function activateTopView() {
  store.setActiveImagerySource('volume')
  instance.value?.setActiveView('volume')
}

function activateSlice(plane: SlicePlane) {
  activeSlice.value = plane
  store.setActiveImagerySource(imagerySourceForPlane(props.ctx, plane))
  instance.value?.setActiveView(plane)
  syncOverlayOptions()
}

function eventPosition(plane: SlicePlane, event: PointerEvent | MouseEvent): Vec3 | null {
  const state = liveState.value
  const canvas = sliceCanvases[plane]
  if (!state || !canvas) return null
  const bounds = canvas.getBoundingClientRect()
  return screenToSlicePhysical(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    state,
    sliceDef(props.ctx, plane).axisMap,
    bounds.width,
    bounds.height,
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
  resizeObserver = new ResizeObserver(() => {
    measure()
    navigatorInstance?.requestRender()
  })
  if (topCanvas.value) resizeObserver.observe(topCanvas.value)
  if (navigatorCanvas.value) resizeObserver.observe(navigatorCanvas.value)
  for (const plane of planes) if (sliceCanvases[plane]) resizeObserver.observe(sliceCanvases[plane]!)
})

onBeforeUnmount(() => {
  mainToken += 1
  navigatorToken += 1
  unsubscribe?.()
  resizeObserver?.disconnect()
  instance.value?.destroy()
  navigatorInstance?.destroy()
  store.setCursor(null)
  store.clearReadouts()
})

watch(() => store.centerPosition.join(':'), () => {
  const galavi = instance.value
  if (galavi && targetsDiffer(galavi.target, store.centerPosition)) galavi.setTarget(store.centerPosition)
})
watch(() => planes.map((plane) => store.sliceByPlane[plane]).join(':'), applySlices)
watch(() => [store.channel, store.contrastMin, store.contrastMax], () => {
  applyImagery()
  void buildNavigator()
})
watch(() => store.plane, () => void buildNavigator())
watch(
  () => [
    store.cursorPosition,
    store.selection,
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
.quadrant-mode { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 2px; overflow: hidden; background: var(--galavi-border); }
.quadrant-cell { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: #000; }
.cell-canvas { display: block; width: 100%; height: 100%; }
.cell-label { position: absolute; z-index: 20; right: 10px; bottom: 9px; padding: 3px 7px; border-radius: 2px; background: var(--galavi-panel-bg); color: var(--galavi-text); font: 600 11px var(--galavi-font-mono); letter-spacing: 0.08em; text-transform: uppercase; pointer-events: none; }
.navigator-overlay { position: absolute; z-index: 30; top: 10px; left: 10px; width: clamp(110px, 13vw, 170px); aspect-ratio: 1; overflow: hidden; border: 1px solid var(--galavi-border); border-radius: var(--radius-sm); background: #000; box-shadow: var(--shadow-lg); pointer-events: none; }
.navigator-overlay canvas { display: block; width: 100%; height: 100%; }
.mode-loading { position: absolute; inset: 0; z-index: 80; display: grid; place-items: center; color: var(--galavi-text-dim); background: var(--app-bg); }
</style>

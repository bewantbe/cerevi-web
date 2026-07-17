<template>
  <div ref="stage" class="quadrant-mode">
    <section class="quadrant-cell volume-cell" @pointerdown="activateTopView">
      <canvas ref="topCanvas" class="cell-canvas"></canvas>
      <div class="navigator-overlay" aria-label="Navigator">
        <canvas ref="navigatorCanvas"></canvas>
      </div>
      <span class="cell-label">3D Volume</span>
      <VolumeSelectionOverlay
        :selection="store.selection"
        :camera="liveState?.exploration.camera ?? null"
        :width="cellSizes.top.width"
        :height="cellSizes.top.height"
      />
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
      <CrosshairOverlay
        :ctx="ctx"
        :plane="plane"
        :state="liveState"
        :position="store.cursorPosition"
        :width="cellSizes[plane].width"
        :height="cellSizes[plane].height"
      />
      <SliceSelectionOverlay
        :ctx="ctx"
        :plane="plane"
        :state="liveState"
        :normal-position="store.positionForSlice(plane, store.sliceByPlane[plane])"
        :enabled="store.isToolEnabled('selector')"
        :unit="unit"
      />
      <RulerOverlay
        v-if="store.isToolEnabled('ruler') && activeSlice === plane"
        :units-per-pixel="sliceUnitsPerPixel(plane)"
        :unit="unit"
        :reset-nonce="store.rulerResetNonce"
      />
    </section>

    <MagnifierCanvas
      v-if="store.isToolEnabled('magnifier')"
      :visible="Boolean(store.cursorPosition && hoveredPlane)"
      :x="magnifierPosition.x"
      :y="magnifierPosition.y"
      @ready="onMagnifierReady"
      @resize="onMagnifierResize"
    />
    <div v-if="!instance" class="mode-loading">Preparing synchronized views...</div>
  </div>
</template>

<script setup lang="ts">
import { cameraDistance, type Galavi, type State, type Vec2, type Vec3 } from 'galavi'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  bootstrap,
  physicalFraming,
  planeLabel,
  sliceDef,
  sliceSource,
  storageSliceIndex,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'
import { buildNavigatorOverview, buildSliceViewer } from '@/galavi/gallery'
import { scaledSliceContrast } from '@/galavi/grid'
import { useVISoRStore } from '@/stores/visor'
import { screenToSlicePhysical, volumeUnitsPerPixel } from '@/utils/viewCoordinates'
import CrosshairOverlay from '@/components/viewer/CrosshairOverlay.vue'
import MagnifierCanvas from '@/components/viewer/MagnifierCanvas.vue'
import RulerOverlay from '@/components/viewer/RulerOverlay.vue'
import SliceSelectionOverlay from '@/components/viewer/SliceSelectionOverlay.vue'
import VolumeSelectionOverlay from '@/components/viewer/VolumeSelectionOverlay.vue'

const props = defineProps<{ ctx: SetupContext }>()
const store = useVISoRStore()
const planes: SlicePlane[] = ['xy', 'xz', 'yz']
const stage = ref<HTMLElement | null>(null)
const topCanvas = ref<HTMLCanvasElement | null>(null)
const navigatorCanvas = ref<HTMLCanvasElement | null>(null)
const sliceCanvases: Partial<Record<SlicePlane, HTMLCanvasElement | null>> = {}
const instance = ref<Galavi | null>(null)
const liveState = ref<State | null>(null)
const activeSlice = ref<SlicePlane>('xy')
const hoveredPlane = ref<SlicePlane | null>(null)
const magnifierPosition = reactive({ x: 0, y: 0 })
const cellSizes = reactive<Record<SlicePlane | 'top', { width: number; height: number }>>({
  top: { width: 0, height: 0 },
  xy: { width: 0, height: 0 },
  xz: { width: 0, height: 0 },
  yz: { width: 0, height: 0 },
})

let magnifierCanvas: HTMLCanvasElement | null = null
let magnifier: Galavi | null = null
let magnifierPlane: SlicePlane | null = null
let magnifierSize = 180
let mainToken = 0
let magnifierToken = 0
let navigatorToken = 0
let navigatorInstance: Galavi | undefined
let unsubscribe: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined

const unit = computed(() => physicalFraming(props.ctx).unit)

function setSliceCanvas(plane: SlicePlane, canvas: HTMLCanvasElement | null) {
  sliceCanvases[plane] = canvas
}

function measure() {
  const top = topCanvas.value
  cellSizes.top.width = top?.clientWidth ?? 0
  cellSizes.top.height = top?.clientHeight ?? 0
  for (const plane of planes) {
    const canvas = sliceCanvases[plane]
    cellSizes[plane].width = canvas?.clientWidth ?? 0
    cellSizes[plane].height = canvas?.clientHeight ?? 0
  }
  instance.value?.requestRender()
  magnifier?.requestRender()
}

function sliceUnitsPerPixel(plane: SlicePlane): number {
  return liveState.value
    ? cameraDistance(liveState.value.exploration.camera) / Math.max(cellSizes[plane].height, 1)
    : 0
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
  galavi.layer('volume')?.setOptions({ selection: { c: store.channel } })
  galavi.layer('volume')?.setRender({ contrastLimits: [store.contrastMin, store.contrastMax] as Vec2 })
  for (const plane of planes) {
    const definition = sliceDef(props.ctx, plane)
    galavi.layer(definition.layerId)?.setOptions({ selection: { c: store.channel } })
    galavi.layer(definition.layerId)?.setRender({
      contrastLimits: scaledSliceContrast(props.ctx, plane, [store.contrastMin, store.contrastMax]),
    })
  }
  applyMagnifierImagery()
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
  void buildNavigator()
  updateLive(galavi.getState())
  measure()
}

function activateTopView() {
  instance.value?.setActiveView('volume')
}

function activateSlice(plane: SlicePlane) {
  activeSlice.value = plane
  instance.value?.setActiveView(plane)
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
    props.ctx,
    plane,
    bounds.width,
    bounds.height,
    store.positionForSlice(plane, store.sliceByPlane[plane]),
  )
}

function onSlicePointerMove(plane: SlicePlane, event: PointerEvent) {
  const position = eventPosition(plane, event)
  const bounds = stage.value?.getBoundingClientRect()
  if (!position || !bounds) return
  hoveredPlane.value = plane
  magnifierPosition.x = event.clientX - bounds.left
  magnifierPosition.y = event.clientY - bounds.top
  store.setCursor(position)
  if (magnifierPlane !== plane) void buildMagnifier(plane)
  else syncMagnifier()
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

function magnifierDistance(plane: SlicePlane): number {
  const definition = sliceDef(props.ctx, plane)
  const scale = sliceSource(props.ctx, plane).pyramid.levels[0].scale[definition.axisMap[1]]
  return Math.max(scale * magnifierSize, scale)
}

async function buildMagnifier(plane = hoveredPlane.value) {
  if (!plane || !magnifierCanvas || !store.isToolEnabled('magnifier')) return
  const currentToken = ++magnifierToken
  magnifier?.destroy()
  magnifier = null
  const cursor = store.cursorPosition ?? store.centerPosition
  const galavi = await buildSliceViewer({
    ctx: props.ctx,
    plane,
    channel: store.channel,
    contrastLimits: scaledSliceContrast(props.ctx, plane, [store.contrastMin, store.contrastMax]),
    sliceIndex: store.sliceByPlane[plane],
    canvas: magnifierCanvas,
    target: cursor,
    distance: magnifierDistance(plane),
  })
  if (currentToken !== magnifierToken) {
    galavi.destroy()
    return
  }
  magnifier = galavi
  magnifierPlane = plane
  syncMagnifier()
}

function applyMagnifierImagery() {
  if (!magnifier || !magnifierPlane) return
  magnifier.layer('slice')?.setOptions({ selection: { c: store.channel } })
  magnifier.layer('slice')?.setRender({
    contrastLimits: scaledSliceContrast(props.ctx, magnifierPlane, [store.contrastMin, store.contrastMax]),
  })
}

function syncMagnifier() {
  if (!magnifier || !magnifierPlane || !store.cursorPosition) return
  const definition = sliceDef(props.ctx, magnifierPlane)
  const state = magnifier.getState()
  const target = [...store.cursorPosition] as Vec3
  const position = [...target] as Vec3
  position[definition.axisMap[2]] += magnifierDistance(magnifierPlane)
  state.exploration.camera.target = target
  state.exploration.camera.position = position
  magnifier.setState(state)
  magnifier.layer('slice')?.setOptions({
    sliceIndex: storageSliceIndex(props.ctx, magnifierPlane, store.sliceByPlane[magnifierPlane]),
  })
}

function onMagnifierReady(canvas: HTMLCanvasElement) {
  magnifierCanvas = canvas
  if (hoveredPlane.value) void buildMagnifier(hoveredPlane.value)
}

function onMagnifierResize(size: number) {
  magnifierSize = size
  syncMagnifier()
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
  magnifierToken += 1
  navigatorToken += 1
  unsubscribe?.()
  resizeObserver?.disconnect()
  instance.value?.destroy()
  navigatorInstance?.destroy()
  magnifier?.destroy()
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
watch(() => store.isToolEnabled('magnifier'), (enabled) => {
  if (enabled && hoveredPlane.value) void buildMagnifier(hoveredPlane.value)
  if (!enabled) {
    magnifierToken += 1
    magnifier?.destroy()
    magnifier = null
    magnifierPlane = null
    magnifierCanvas = null
  }
})
</script>

<style scoped>
.quadrant-mode { position: absolute; inset: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); gap: 2px; overflow: hidden; background: var(--c-border-strong); }
.quadrant-cell { position: relative; min-width: 0; min-height: 0; overflow: hidden; background: #000; }
.cell-canvas { display: block; width: 100%; height: 100%; }
.cell-label { position: absolute; z-index: 20; right: 10px; bottom: 9px; padding: 3px 7px; border-radius: 4px; background: rgba(5, 8, 12, 0.72); color: var(--c-text-strong); font-size: 11px; font-weight: 600; pointer-events: none; }
.navigator-overlay { position: absolute; z-index: 30; top: 10px; left: 10px; width: clamp(110px, 13vw, 170px); aspect-ratio: 1; overflow: hidden; border: 1px solid var(--c-border-strong); border-radius: var(--radius-sm); background: #000; box-shadow: var(--shadow-lg); pointer-events: none; }
.navigator-overlay canvas { display: block; width: 100%; height: 100%; }
.mode-loading { position: absolute; inset: 0; z-index: 80; display: grid; place-items: center; color: var(--c-text-muted); background: var(--c-bg); }
</style>
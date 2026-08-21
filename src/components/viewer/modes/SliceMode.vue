<template>
  <div class="slice-mode">
    <div
      ref="mainViewport"
      class="main-viewport"
      :class="{ 'magnifier-2d-active': store.magnifierMode === '2d', 'magnifier-3d-active': store.magnifierMode === '3d' }"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
      @click="pinMagnifierFromEvent"
      @dblclick="recenterFromEvent"
    >
      <canvas ref="mainCanvas" class="main-canvas"></canvas>
    </div>

    <aside class="slice-navigator-frame" aria-label="Slice navigator">
      <SliceNavigator
        :plane="store.plane"
        :slice="store.currentSlice"
        :max="navMax"
        :open="true"
      />
    </aside>

    <!-- defer: ViewsBlock renders the target in the same flush as this
         component, so the selector only resolves after the mount flush. -->
    <Teleport to="#views-block-body" defer>
      <div class="views-panel" aria-label="Other slice views">
        <button v-for="plane in otherPlanes" :key="plane" type="button" class="context-view" @click="store.setPlane(plane)">
          <span class="context-canvas-wrap">
            <canvas :ref="(element) => setThumbnailCanvas(plane, element as HTMLCanvasElement | null)"></canvas>
          </span>
          <span>{{ planeLabel(plane) }}</span>
        </button>
      </div>
    </Teleport>

    <div class="slider-dock">
      <GallerySlider
        ref="slider"
        :value="store.currentSlice"
        :max="sliceMax"
        :label="planeLabel(store.plane)"
        @update:value="setSlice"
      />
    </div>

    <div v-if="!mainInstance" class="mode-loading" :class="{ 'mode-error': buildError }">
      {{ buildError ?? 'Preparing slice gallery...' }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { type LayerPatch, type State, type Vec3, type ViewerEngine } from 'galavi/advanced'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  describeBuildError,
  formatResolutionReadout,
  pointerToSlicePhysical,
  sliceCameraResolution,
  syncViewOverlays,
  useGalaviSession,
  vec3Differ,
  viewUnitsPerPixel,
  watchCenterEcho,
} from '@/composables/useGalaviSession'
import {
  bootstrap,
  channelColor,
  imagerySourceForPlane,
  physicalFraming,
  planeLabel,
  sliceChannelLayerId,
  sliceCount,
  sliceDef,
  storageSliceIndex,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'
import GallerySlider from '@/components/viewer/GallerySlider.vue'
import SliceNavigator from '@/components/viewer/SliceNavigator.vue'

// ============================================================================
// COMPONENT
// ============================================================================

const props = defineProps<{ ctx: SetupContext }>()
const store = useCereviStore()
const mainViewport = ref<HTMLElement | null>(null)
const mainCanvas = ref<HTMLCanvasElement | null>(null)
const slider = ref<InstanceType<typeof GallerySlider> | null>(null)
const mainInstance = shallowRef<ViewerEngine | null>(null)
const buildError = ref<string | null>(null)
const mainState = ref<State | null>(null)
const thumbnailCanvases: Partial<Record<SlicePlane, HTMLCanvasElement | null>> = {}
const session = useGalaviSession()
let buildPromise: Promise<void> | null = null

const otherPlanes = computed<SlicePlane[]>(() => (['xy', 'xz', 'yz'] as SlicePlane[]).filter((plane) => plane !== store.plane))
const sliceMax = computed(() => Math.max(0, sliceCount(props.ctx, store.plane) - 1))
const navMax = computed(() => Math.max(0, sliceCount(props.ctx, store.plane) - 1))
const unit = computed(() => physicalFraming(props.ctx).unit)

function setThumbnailCanvas(plane: SlicePlane, canvas: HTMLCanvasElement | null) {
  if (thumbnailCanvases[plane] === canvas) return
  thumbnailCanvases[plane] = canvas
  // The deferred Teleport mounts the thumbnails after onMounted's first
  // rebuild attempt has already bailed — kick the (self-guarded) build again
  // once the last prerequisite canvas arrives. Skipped once a session exists.
  if (canvas && !mainInstance.value) void rebuild()
}

function currentPhysicalTarget(state: State): Vec3 {
  const target = [...state.exploration.camera.target] as Vec3
  target[sliceDef(props.ctx, store.plane).axisMap[2]] = store.positionForSlice(store.plane, store.currentSlice)
  return target
}

function updateMainState(state: State) {
  mainState.value = state
  const target = currentPhysicalTarget(state)
  if (vec3Differ(target, store.centerPosition)) store.setCenter(target)
  const definition = sliceDef(props.ctx, store.plane)
  const resolutionChannel = store.galleryChannels.find((channel) => channel.visible) ?? store.galleryChannels[0]
  const resolutionLayerId = resolutionChannel
    ? sliceChannelLayerId(definition, resolutionChannel.index)
    : undefined
  store.setResolutionReadout(
    formatResolutionReadout(
      resolutionLayerId ? viewUnitsPerPixel(mainInstance.value, store.plane, resolutionLayerId) : undefined,
      sliceCameraResolution(state, mainCanvas.value),
      unit.value,
    ),
  )
}

/** Per-mode overlay spec; the shared rules live in syncViewOverlays. */
function syncOverlayOptions() {
  const engine = mainInstance.value
  if (!engine) return
  const selectorActive = store.isToolEnabled('selector')
  syncViewOverlays(
    engine,
    store,
    unit.value,
    (['xy', 'xz', 'yz'] as SlicePlane[]).map((plane) => {
      const main = plane === store.plane
      return {
        view: plane as string,
        crosshair: true,
        ruler: main,
        rois: { enabled: main && selectorActive, plane },
        magnifier: main,
        magnifierPlane: plane,
      }
    }),
  )
}

/** Canvas map for the three slice views: main gallery + thumbnails. */
function sessionCanvases(): Record<string, HTMLCanvasElement> {
  const canvases: Record<string, HTMLCanvasElement> = {}
  if (mainCanvas.value) canvases[store.plane] = mainCanvas.value
  for (const plane of otherPlanes.value) {
    const canvas = thumbnailCanvases[plane]
    if (canvas) canvases[plane] = canvas
  }
  return canvases
}

async function buildSession() {
  if (!mainCanvas.value || otherPlanes.value.some((plane) => !thumbnailCanvases[plane])) return
  const token = session.nextBuildToken()
  slider.value?.stop()
  await nextTick()

  let engine: ViewerEngine
  try {
    // Build and GPU-init the replacement off-canvas first: mounting
    // reconfigures the canvases' WebGPU contexts, which the live engine still
    // owns — a failed build must leave it running.
    engine = await bootstrap(
      props.ctx,
      mainCanvas.value,
      Object.fromEntries(otherPlanes.value.map((plane) => [plane, thumbnailCanvases[plane]!])),
      store.plane,
      otherPlanes.value,
      { composeSliceChannels: true, deferMount: true },
    )
  } catch (err) {
    if (session.isBuildCurrent(token)) {
      console.error('[slice] shared view session failed:', err)
      // The live engine keeps running; only surface the failure when there
      // is nothing left to show.
      if (!mainInstance.value) buildError.value = describeBuildError(err)
    }
    return
  }
  if (!session.isBuildCurrent(token)) {
    // Superseded while building — destroy the never-mounted result.
    engine.destroy()
    return
  }
  // Destroy only now: the old engine owns the canvases' WebGPU contexts until
  // this point, and the replacement must not be mounted over them.
  session.unsubscribeSession()
  mainInstance.value?.destroy()
  mainInstance.value = engine
  buildError.value = null
  try {
    await engine.mountAll(sessionCanvases())
  } catch (err) {
    engine.destroy()
    if (mainInstance.value === engine) mainInstance.value = null
    if (session.isBuildCurrent(token)) {
      console.error('[slice] shared view session mount failed:', err)
      buildError.value = describeBuildError(err)
    }
    return
  }
  engine.setActiveView(store.plane)
  engine.setTarget(store.centerPosition)
  store.setActiveImagerySource(imagerySourceForPlane(props.ctx, store.plane))
  session.subscribeTo(engine, updateMainState)
  updateMainState(engine.getState())
  applySlices()
  applyChannels()
  syncOverlayOptions()
}

function rebuild(): Promise<void> {
  if (buildPromise) return buildPromise
  buildPromise = buildSession().finally(() => {
    buildPromise = null
  })
  return buildPromise
}

async function switchPlane(nextPlane: SlicePlane, previousPlane: SlicePlane) {
  const engine = mainInstance.value
  if (!engine || !mainCanvas.value) {
    await rebuild()
    return
  }

  await nextTick()
  const previousSideCanvas = thumbnailCanvases[previousPlane]
  if (!previousSideCanvas) {
    console.error(`[slice] missing ${previousPlane} side canvas during view swap`)
    return
  }

  // BaseView.mount already unmounts the view's previous canvas binding, so a
  // plain mount pair performs the canvas swap.
  try {
    await engine.mount(nextPlane, mainCanvas.value)
    await engine.mount(previousPlane, previousSideCanvas)
  } catch (err) {
    // The swap may have remounted only one view — recover with a full rebuild
    // (which keeps the current engine until its replacement is ready).
    console.error('[slice] view swap failed:', err)
    await rebuild()
    return
  }
  engine.setActiveView(nextPlane)
  store.setActiveImagerySource(imagerySourceForPlane(props.ctx, nextPlane))
  applySlices()
  applyChannels()
  syncOverlayOptions()
  updateMainState(engine.getState())
}

function applyChannels() {
  const engine = mainInstance.value
  if (!engine) return
  const patches: LayerPatch[] = []
  for (const plane of ['xy', 'xz', 'yz'] as SlicePlane[]) {
    const definition = sliceDef(props.ctx, plane)
    for (const channel of store.galleryChannels) {
      patches.push({
        id: sliceChannelLayerId(definition, channel.index),
        render: {
          color: channel.color,
          contrastLimits: store.contrastForPlane(plane, channel.index),
          visible: channel.visible,
        },
      })
    }
  }
  const firstVisible = store.galleryChannels.find((channel) => channel.visible)
  if (props.ctx.hasMesh) {
    patches.push({
      id: 'surface',
      render: { color: firstVisible?.color ?? channelColor(props.ctx, store.channel) },
    })
  }
  const activeChannel = firstVisible ?? store.galleryChannels[0]
  if (activeChannel) {
    patches.push({
      id: 'volume',
      options: { selection: { c: activeChannel.index } },
      render: {
        visible: true,
        color: activeChannel.color,
        contrastLimits: store.contrastForPlane(store.plane, activeChannel.index),
      },
    })
  }
  engine.updateLayers(patches)
}

function applySlices() {
  const engine = mainInstance.value
  if (engine) {
    engine.updateLayers(
      (['xy', 'xz', 'yz'] as SlicePlane[]).flatMap((plane) => {
        const definition = sliceDef(props.ctx, plane)
        return store.galleryChannels.map((channel) => ({
          id: sliceChannelLayerId(definition, channel.index),
          options: { sliceIndex: storageSliceIndex(props.ctx, plane, store.sliceByPlane[plane]) },
        }))
      }),
    )
  }
  const state = engine?.getState() ?? mainState.value
  // Both are null before the first rebuild completes — nothing to reflect.
  if (state) updateMainState(state)
}

function setSlice(index: number) {
  store.setSlice(store.plane, index)
}

function pointerPosition(event: PointerEvent | MouseEvent): Vec3 | null {
  return pointerToSlicePhysical(
    event,
    mainCanvas.value,
    mainState.value,
    sliceDef(props.ctx, store.plane).axisMap,
    store.positionForSlice(store.plane, store.currentSlice),
  )
}

function onPointerMove(event: PointerEvent) {
  const position = pointerPosition(event)
  if (!position) return
  store.setCursor(position)
}

function onPointerLeave() {
  store.setCursor(null)
}

function pinMagnifierFromEvent(event: MouseEvent) {
  if (store.magnifierMode !== '3d' || event.target !== mainCanvas.value) return
  const position = pointerPosition(event)
  if (position) store.pinMagnifier3d(position, store.plane)
}

function recenterFromEvent(event: MouseEvent) {
  if (!store.isToolEnabled('selector')) return
  const position = pointerPosition(event)
  if (position) store.setCenter(position)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowLeft') store.setSlice(store.plane, Math.max(0, store.currentSlice - 1))
  if (event.key === 'ArrowRight') store.setSlice(store.plane, Math.min(sliceMax.value, store.currentSlice + 1))
}

onMounted(async () => {
  await nextTick()
  void rebuild()
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  session.teardownSession(mainInstance.value, store)
})

watch(() => store.plane, (nextPlane, previousPlane) => {
  void switchPlane(nextPlane, previousPlane)
})
watch(() => store.currentSlice, applySlices)
watch(() => store.galleryChannels, applyChannels, { deep: true })
watchCenterEcho(store, () => mainInstance.value, syncOverlayOptions)
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
  ],
  syncOverlayOptions,
)
</script>

<style scoped>
.slice-mode { position: absolute; inset: 0; overflow: hidden; background: #000; }
.main-viewport.magnifier-2d-active .main-canvas { cursor: none; }
.main-viewport.magnifier-3d-active .main-canvas {
  cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='20' viewBox='0 0 20 20'%3E%3Ccircle cx='8' cy='8' r='5' fill='%23040b0f' stroke='%235ce9ff' stroke-width='1.5'/%3E%3Cpath d='M12 12l5 5' stroke='%235ce9ff' stroke-width='1.5'/%3E%3Ctext x='6.2' y='10.4' font-size='7' fill='%235ce9ff'%3E3%3C/text%3E%3C/svg%3E") 8 8, zoom-in;
}
/* Bottom 64px band is reserved for the slider dock (slider bar ≈ 52px +
   gap); the canvas no longer extends underneath it. */
.main-viewport { position: absolute; top: 0; right: 0; bottom: 64px; left: 0; overflow: hidden; }
.main-canvas { display: block; width: 100%; height: 100%; }
.slice-navigator-frame { position: absolute; z-index: 55; top: 16px; right: 42px; display: flex; width: clamp(150px, 18vw, 230px); aspect-ratio: 1; overflow: hidden; border: 1px solid var(--galavi-border); background: #000; box-shadow: 0 0 16px var(--galavi-accent-soft), var(--shadow-lg); clip-path: polygon(0 10px, 10px 0, calc(100% - 10px) 0, 100% 10px, 100% calc(100% - 10px), calc(100% - 10px) 100%, 10px 100%, 0 calc(100% - 10px)); }
.slice-navigator-frame :deep(.slice-navigator) { border: 0; border-radius: 0; }
.views-panel { display: flex; width: calc(var(--left-panel-width, 290px) - 26px); flex-direction: column; gap: 10px; }
.context-view { display: flex; flex-direction: column; align-items: stretch; gap: 5px; padding: 0; border: 0; background: transparent; color: var(--galavi-text); font: 600 11px var(--galavi-font-mono); letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
.context-canvas-wrap { position: relative; display: block; width: calc(var(--left-panel-width, 290px) - 46px); aspect-ratio: 1; align-self: center; overflow: hidden; border: 1px solid var(--galavi-border); background: #000; clip-path: polygon(0 7px, 7px 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 7px 100%, 0 calc(100% - 7px)); }
.context-view:hover .context-canvas-wrap { border-color: var(--galavi-accent); }
.context-view canvas { display: block; width: 100%; height: 100%; }
.slider-dock { position: absolute; z-index: 65; right: 0; bottom: 0; left: 0; display: flex; height: 64px; align-items: center; padding: 0 16px; }
.slider-dock :deep(.slider-bar) { width: 100%; flex: 1 1 auto; }
.mode-loading { position: absolute; z-index: 40; top: 0; right: 0; bottom: 64px; left: 0; display: grid; place-items: center; color: var(--galavi-text-dim); background: transparent; pointer-events: none; }
.mode-error { padding: 24px; color: var(--galavi-warn); text-align: center; }
</style>

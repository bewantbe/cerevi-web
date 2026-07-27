<template>
  <div class="slice-mode">
    <div
      ref="mainViewport"
      class="main-viewport"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
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

    <div v-if="!mainInstance" class="mode-loading">Preparing slice gallery...</div>
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
const mainInstance = shallowRef<Galavi | null>(null)
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
  const galavi = mainInstance.value
  if (!galavi) return
  const selectorActive = store.isToolEnabled('selector')
  syncViewOverlays(
    galavi,
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
      }
    }),
  )
}

async function buildSession() {
  if (!mainCanvas.value || otherPlanes.value.some((plane) => !thumbnailCanvases[plane])) return
  const token = session.nextBuildToken()
  slider.value?.stop()
  session.unsubscribeSession()
  mainInstance.value?.destroy()
  mainInstance.value = null
  await nextTick()

  const galavi = await bootstrap(
    props.ctx,
    mainCanvas.value,
    Object.fromEntries(otherPlanes.value.map((plane) => [plane, thumbnailCanvases[plane]!])),
    store.plane,
    otherPlanes.value,
    { composeSliceChannels: true },
  ).catch((err) => {
    console.error('[slice] shared view session failed:', err)
    return null
  })
  if (!galavi) return
  if (!session.isBuildCurrent(token)) {
    galavi.destroy()
    return
  }
  mainInstance.value = galavi
  galavi.setActiveView(store.plane)
  galavi.setTarget(store.centerPosition)
  store.setActiveImagerySource(imagerySourceForPlane(props.ctx, store.plane))
  session.subscribeTo(galavi, updateMainState)
  updateMainState(galavi.getState())
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
  const galavi = mainInstance.value
  if (!galavi || !mainCanvas.value) {
    await rebuild()
    return
  }

  await nextTick()
  const previousSideCanvas = thumbnailCanvases[previousPlane]
  if (!previousSideCanvas) {
    console.error(`[slice] missing ${previousPlane} side canvas during view swap`)
    return
  }

  galavi.unmount(previousPlane)
  galavi.unmount(nextPlane)
  await galavi.mount(nextPlane, mainCanvas.value)
  await galavi.mount(previousPlane, previousSideCanvas)
  galavi.setActiveView(nextPlane)
  store.setActiveImagerySource(imagerySourceForPlane(props.ctx, nextPlane))
  applySlices()
  applyChannels()
  syncOverlayOptions()
  updateMainState(galavi.getState())
}

function applyChannels() {
  const galavi = mainInstance.value
  if (!galavi) return
  for (const plane of ['xy', 'xz', 'yz'] as SlicePlane[]) {
    const definition = sliceDef(props.ctx, plane)
    for (const channel of store.galleryChannels) {
      galavi.layer(sliceChannelLayerId(definition, channel.index))?.setRender({
        color: channel.color,
        contrastLimits: store.contrastForPlane(plane, channel.index),
        visible: channel.visible,
      })
    }
  }
  const firstVisible = store.galleryChannels.find((channel) => channel.visible)
  galavi.layer('surface')?.setRender({ color: firstVisible?.color ?? channelColor(props.ctx, store.channel) })
}

function applySlices() {
  for (const plane of ['xy', 'xz', 'yz'] as SlicePlane[]) {
    const definition = sliceDef(props.ctx, plane)
    for (const channel of store.galleryChannels) {
      mainInstance.value?.layer(sliceChannelLayerId(definition, channel.index))?.setOptions({
        sliceIndex: storageSliceIndex(props.ctx, plane, store.sliceByPlane[plane]),
      })
    }
  }
  const state = mainInstance.value?.getState() ?? mainState.value
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
    store.enabledTools.selector,
  ],
  syncOverlayOptions,
)
</script>

<style scoped>
.slice-mode { position: absolute; inset: 0; overflow: hidden; background: #000; }
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
</style>

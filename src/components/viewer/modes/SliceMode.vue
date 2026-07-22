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

    <!-- Panel bodies are Vue-rendered (Teleport) into the detached hosts that
         the galavi foldablepanel overlays mount as their `content`. -->
    <Teleport :to="contextPanelHost">
      <div class="context-panel" aria-label="Other slice views">
        <SliceNavigator
          :plane="store.plane"
          :slice="store.currentSlice"
          :max="navMax"
          :open="contextPanelOpen"
        />
        <button v-for="plane in otherPlanes" :key="plane" type="button" class="context-view" @click="store.setPlane(plane)">
          <span class="context-canvas-wrap">
            <canvas :ref="(element) => setThumbnailCanvas(plane, element as HTMLCanvasElement | null)"></canvas>
          </span>
          <span>{{ planeLabel(plane) }}</span>
        </button>
      </div>
    </Teleport>

    <Teleport :to="channelPanelHost">
      <aside class="channel-panel" aria-label="Channel controls">
        <div v-for="channel in store.galleryChannels" :key="channel.index" class="channel-row">
          <div class="channel-heading">
            <button type="button" class="visibility-button" :class="{ active: channel.visible }" :title="channel.visible ? 'Hide channel' : 'Show channel'" @click="channel.visible = !channel.visible">
              <svg v-if="channel.visible" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" aria-hidden="true">
                <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
              <svg v-else viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" aria-hidden="true">
                <path d="M3 3l10 10" />
                <path d="M6.5 4.1A6.9 6.9 0 0 1 8 4c4.1 0 6.5 4 6.5 4a12.7 12.7 0 0 1-2.2 2.7M4.1 5.3A12.4 12.4 0 0 0 1.5 8s2.4 4 6.5 4a6.7 6.7 0 0 0 2.6-.5" />
              </svg>
            </button>
            <input v-model="channel.color" type="color" class="channel-color" :title="`${channel.label} color`" :aria-label="`${channel.label} color`" />
            <span>{{ channel.label }}</span>
          </div>
          <DualRangeSlider
            :model-value="[channel.contrastMin, channel.contrastMax]"
            :bounds="store.contrastRange"
            :step="0.001"
            scale="log"
            @update:model-value="(range) => setChannelContrast(channel.index, range)"
          />
        </div>
      </aside>
    </Teleport>

    <div class="slider-dock">
      <GallerySlider
        ref="slider"
        :value="store.currentSlice"
        :max="sliceMax"
        :label="planeLabel(store.plane)"
        @update:value="setSlice"
        @preview-hover="onPreviewHover"
        @preview-ready="onPreviewReady"
      />
    </div>

    <div v-if="!mainInstance" class="mode-loading">Preparing slice gallery...</div>
  </div>
</template>

<script setup lang="ts">
import {
  cameraDistance,
  createGalavi,
  screenToSlicePhysical,
  FoldablePanelOverlay,
  type Galavi,
  type LayerConfig,
  type State,
  type Vec2,
  type Vec3,
  type ViewConfig,
} from 'galavi'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import {
  buildSliceViewer,
  fitSliceCamera,
  physicalFraming,
  planeLabel,
  sliceCount,
  sliceData,
  sliceDef,
  sliceSource,
  storageSliceIndex,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'
import { useVISoRStore, type GalleryChannel } from '@/stores/visor'
import DualRangeSlider from '@/components/viewer/DualRangeSlider.vue'
import GallerySlider from '@/components/viewer/GallerySlider.vue'
import SliceNavigator from '@/components/viewer/SliceNavigator.vue'

// ============================================================================
// MULTI-CHANNEL COMPOSITOR (dissolved from src/galavi/gallery.ts, D7)
// One slice view stacking every gallery channel additively.
// ============================================================================

function compositorLayerId(channelIndex: number): string {
  return `comp_c${channelIndex}`
}

function makeCompositorLayer(
  ctx: SetupContext,
  plane: SlicePlane,
  channel: GalleryChannel,
  sliceIndex: number,
): LayerConfig {
  const definition = sliceDef(ctx, plane)
  const source = sliceSource(ctx, plane)
  return {
    id: compositorLayerId(channel.index),
    type: 'slice',
    data: sliceData(ctx, plane),
    options: {
      axes: definition.axes,
      sliceIndex: storageSliceIndex(ctx, plane, sliceIndex),
      selection: { ...source.info.defaultSelection, c: channel.index },
    },
    render: {
      visible: channel.visible,
      color: channel.color,
      contrastLimits: [channel.contrastMin, channel.contrastMax],
      blending: 'additive',
    },
  } as LayerConfig
}

interface BuildCompositorOptions {
  ctx: SetupContext
  plane: SlicePlane
  channels: GalleryChannel[]
  sliceIndex: number
  canvas: HTMLCanvasElement
}

async function buildCompositor(options: BuildCompositorOptions): Promise<Galavi> {
  const { ctx, plane, channels, sliceIndex, canvas } = options
  const camera = fitSliceCamera(ctx, plane)
  const { size, unit } = physicalFraming(ctx)
  const layers = channels.map((channel) => makeCompositorLayer(ctx, plane, channel, sliceIndex))
  const view: ViewConfig = {
    type: 'slice',
    canvas,
    layers: layers.map((layer) => layer.id),
    controls: { panzoom: {} },
    overlays: {
      // Tools are hidden until the store wires visibility via setOverlayOptions.
      crosshair: { visible: false },
      ruler: { visible: false },
      roiselector: { visible: false, enabled: false },
      magnifier: { visible: false },
    },
    label: plane,
    activatable: true,
  }
  const state: State = {
    physical: { spatial: { size, unit } },
    layers,
    exploration: {
      camera: {
        navMode: 'fly',
        projMode: 'orthographic',
        position: camera.position,
        target: camera.target,
      },
    },
  }
  const galavi = await createGalavi({ state, views: { main: view } })
  galavi.setActiveView('main')
  return galavi
}

// ============================================================================
// COMPONENT
// ============================================================================

const props = defineProps<{ ctx: SetupContext }>()
const store = useVISoRStore()
const mainViewport = ref<HTMLElement | null>(null)
const mainCanvas = ref<HTMLCanvasElement | null>(null)
const slider = ref<InstanceType<typeof GallerySlider> | null>(null)
const mainInstance = shallowRef<Galavi | null>(null)
const mainState = ref<State | null>(null)
const thumbnailCanvases: Partial<Record<SlicePlane, HTMLCanvasElement | null>> = {}
const thumbnailInstances: Partial<Record<SlicePlane, Galavi>> = {}
// Detached hosts mounted into the galavi foldablepanel overlays via their
// `content` option; the panel bodies above reach them through <Teleport>.
// The hosts persist across compositor rebuilds (plane switches).
const contextPanelHost = document.createElement('div')
const channelPanelHost = document.createElement('div')
let previewCanvas: HTMLCanvasElement | null = null
let preview: Galavi | null = null
let rebuildToken = 0
let previewToken = 0
let unsubscribe: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined

const otherPlanes = computed<SlicePlane[]>(() => (['xy', 'xz', 'yz'] as SlicePlane[]).filter((plane) => plane !== store.plane))
const sliceMax = computed(() => Math.max(0, sliceCount(props.ctx, store.plane) - 1))
const navMax = computed(() => Math.max(0, sliceCount(props.ctx, store.plane) - 1))
const contextPanelOpen = ref(true)
const channelPanelOpen = ref(true)
const unit = computed(() => physicalFraming(props.ctx).unit)

function setThumbnailCanvas(plane: SlicePlane, canvas: HTMLCanvasElement | null) {
  thumbnailCanvases[plane] = canvas
}

function activeChannel() {
  return store.galleryChannels.find((channel) => channel.visible) ?? null
}

function destroyThumbnails() {
  for (const plane of ['xy', 'yz', 'xz'] as SlicePlane[]) {
    thumbnailInstances[plane]?.destroy()
    delete thumbnailInstances[plane]
  }
}

function moveCameraTarget(galavi: Galavi, target: Vec3) {
  const state = galavi.getState()
  const camera = state.exploration.camera
  const delta: Vec3 = [target[0] - camera.target[0], target[1] - camera.target[1], target[2] - camera.target[2]]
  camera.target = [...target] as Vec3
  camera.position = [camera.position[0] + delta[0], camera.position[1] + delta[1], camera.position[2] + delta[2]]
  galavi.setState(state)
}

function currentPhysicalTarget(state: State): Vec3 {
  const target = [...state.exploration.camera.target] as Vec3
  target[sliceDef(props.ctx, store.plane).axisMap[2]] = store.positionForSlice(store.plane, store.currentSlice)
  return target
}

function updateMainState(state: State) {
  mainState.value = state
  const target = currentPhysicalTarget(state)
  if (target.some((value, axis) => Math.abs(value - store.centerPosition[axis]) > 1e-5)) store.setCenter(target)
  const probe = activeChannel()
  const viewResolution = probe
    ? mainInstance.value?.view('main').getResolution(compositorLayerId(probe.index))?.unitsPerPixel
    : undefined
  const height = mainCanvas.value?.clientHeight ?? 0
  const cameraResolution = height > 0 ? cameraDistance(state.exploration.camera) / height : 0
  const resolution = viewResolution && viewResolution > 0 ? viewResolution : cameraResolution
  store.setReadouts(
    `${target[0].toFixed(1)}, ${target[1].toFixed(1)}, ${target[2].toFixed(1)} ${unit.value}`,
    resolution > 0 ? `${resolution.toFixed(2)} ${unit.value}/px` : '—',
  )
}

/**
 * Mount the two galavi foldablepanel overlays (left "other views" + right
 * "channels") on the compositor view. View configs key overlays by type, so a
 * second panel is attached imperatively through the public BaseView API and
 * mounted onto the viewport host alongside the config-driven overlays. They
 * are destroyed with the view (rebuild / mode unmount) and recreated here.
 */
function mountPanelOverlays(instance: Galavi) {
  const host = mainViewport.value
  if (!host) return
  const view = instance.view('main').base

  const contextPanel = new FoldablePanelOverlay()
  contextPanel.setOptions({
    side: 'left',
    open: contextPanelOpen.value,
    width: 236,
    label: 'other views',
    top: 16,
    bottom: 82,
    content: contextPanelHost,
    onOpenChange: (open: boolean) => { contextPanelOpen.value = open },
  })
  view.addOverlay(contextPanel)
  contextPanel.mount(host)

  const channelPanel = new FoldablePanelOverlay()
  channelPanel.setOptions({
    side: 'right',
    open: channelPanelOpen.value,
    width: 278,
    label: 'channels',
    top: 16,
    bottom: 82,
    content: channelPanelHost,
    onOpenChange: (open: boolean) => { channelPanelOpen.value = open },
  })
  view.addOverlay(channelPanel)
  channelPanel.mount(host)
}

/** Push store tool/selection/cursor state into the galavi overlay options. */
function syncOverlayOptions() {
  const main = mainInstance.value
  if (!main) return
  const cursor = store.cursorPosition
  const selectorActive = store.isToolEnabled('selector')
  main.view('main').setOverlayOptions('crosshair', {
    visible: store.isToolEnabled('crosshair') && Boolean(cursor),
    ...(cursor ? { position: cursor } : {}),
  })
  main.view('main').setOverlayOptions('ruler', {
    visible: store.isToolEnabled('ruler'),
    unit: unit.value,
    resetNonce: store.rulerResetNonce,
  })
  main.view('main').setOverlayOptions('roiselector', {
    visible: selectorActive || Boolean(store.selection),
    enabled: selectorActive,
    roi: store.selection,
    unit: unit.value,
    onRoiChange: (roi: { min: Vec3; max: Vec3 }) => store.setSelection(roi),
  })
  main.view('main').setOverlayOptions('magnifier', {
    visible: store.isToolEnabled('magnifier') && Boolean(cursor),
    position: cursor,
  })
}

async function rebuild() {
  if (!mainCanvas.value) return
  const token = ++rebuildToken
  slider.value?.stop()
  unsubscribe?.()
  unsubscribe = undefined
  mainInstance.value?.destroy()
  mainInstance.value = null
  destroyThumbnails()
  preview?.destroy()
  preview = null
  await nextTick()

  const main = await buildCompositor({
    ctx: props.ctx,
    plane: store.plane,
    channels: store.galleryChannels,
    sliceIndex: store.currentSlice,
    canvas: mainCanvas.value,
  })
  if (token !== rebuildToken) {
    main.destroy()
    return
  }
  mainInstance.value = main
  moveCameraTarget(main, store.centerPosition)
  mountPanelOverlays(main)
  unsubscribe = main.subscribe(updateMainState)
  updateMainState(main.getState())

  for (const plane of otherPlanes.value) {
    const canvas = thumbnailCanvases[plane]
    if (!canvas) continue
    const channel = activeChannel()
    const thumbnail = await buildSliceViewer({
      ctx: props.ctx,
      plane,
      channel: channel?.index ?? null,
      color: channel?.color,
      contrastLimits: channel ? store.contrastForPlane(plane, channel.index) : undefined,
      sliceIndex: store.sliceByPlane[plane],
      canvas,
    })
    if (token !== rebuildToken) {
      thumbnail.destroy()
      return
    }
    moveCameraTarget(thumbnail, store.centerPosition)
    thumbnailInstances[plane] = thumbnail
  }

  await rebuildPreview()
  syncOverlayOptions()
  observeCanvases()
}

function applyChannels() {
  const main = mainInstance.value
  if (main) {
    for (const channel of store.galleryChannels) {
      main.layer(compositorLayerId(channel.index))?.setRender({
        color: channel.color,
        contrastLimits: [channel.contrastMin, channel.contrastMax],
        visible: channel.visible,
      })
    }
  }

  const channel = activeChannel()
  for (const plane of otherPlanes.value) {
    const layer = thumbnailInstances[plane]?.layer('slice')
    if (!layer) continue
    if (!channel) layer.setRender({ visible: false })
    else {
      layer.setOptions({ selection: { c: channel.index } })
      layer.setRender({
        color: channel.color,
        contrastLimits: store.contrastForPlane(plane, channel.index),
        visible: true,
      })
    }
  }
  if (preview) updateSingleChannelLayer(preview)
}

function updateSingleChannelLayer(galavi: Galavi) {
  const channel = activeChannel()
  const layer = galavi.layer('slice')
  if (!layer) return
  if (!channel) layer.setRender({ visible: false })
  else {
    layer.setOptions({ selection: { c: channel.index } })
    layer.setRender({ color: channel.color, contrastLimits: [channel.contrastMin, channel.contrastMax], visible: true })
  }
}

function applySlices() {
  const mainSliceIndex = storageSliceIndex(props.ctx, store.plane, store.currentSlice)
  for (const channel of store.galleryChannels) {
    mainInstance.value?.layer(compositorLayerId(channel.index))?.setOptions({ sliceIndex: mainSliceIndex })
  }
  for (const plane of otherPlanes.value) {
    thumbnailInstances[plane]?.layer('slice')?.setOptions({
      sliceIndex: storageSliceIndex(props.ctx, plane, store.sliceByPlane[plane]),
    })
  }
  updateMainState(mainInstance.value?.getState() ?? mainState.value!)
}

function setChannelContrast(index: number, range: Vec2) {
  store.setGalleryChannelContrast(index, range)
}

function setSlice(index: number) {
  store.setSlice(store.plane, index)
}

async function rebuildPreview() {
  if (!previewCanvas) return
  const token = ++previewToken
  preview?.destroy()
  const channel = activeChannel()
  const next = await buildSliceViewer({
    ctx: props.ctx,
    plane: store.plane,
    channel: channel?.index ?? null,
    color: channel?.color,
    contrastLimits: channel ? [channel.contrastMin, channel.contrastMax] : undefined,
    sliceIndex: store.currentSlice,
    canvas: previewCanvas,
  })
  if (token !== previewToken) next.destroy()
  else preview = next
}

function onPreviewHover(index: number | null) {
  if (index !== null) {
    preview?.layer('slice')?.setOptions({ sliceIndex: storageSliceIndex(props.ctx, store.plane, index) })
  }
}

function onPreviewReady(canvas: HTMLCanvasElement) {
  previewCanvas = canvas
  void rebuildPreview()
}

function pointerPosition(event: PointerEvent | MouseEvent): Vec3 | null {
  if (!mainState.value || !mainCanvas.value) return null
  const bounds = mainCanvas.value.getBoundingClientRect()
  return screenToSlicePhysical(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    mainState.value,
    sliceDef(props.ctx, store.plane).axisMap,
    bounds.width,
    bounds.height,
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

function observeCanvases() {
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    mainInstance.value?.requestRender()
    preview?.requestRender()
    for (const instance of Object.values(thumbnailInstances)) instance?.requestRender()
  })
  if (mainCanvas.value) resizeObserver.observe(mainCanvas.value)
  for (const plane of otherPlanes.value) if (thumbnailCanvases[plane]) resizeObserver.observe(thumbnailCanvases[plane]!)
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
  rebuildToken += 1
  previewToken += 1
  window.removeEventListener('keydown', onKeydown)
  unsubscribe?.()
  resizeObserver?.disconnect()
  mainInstance.value?.destroy()
  destroyThumbnails()
  preview?.destroy()
  store.setCursor(null)
  store.clearReadouts()
})

watch(() => store.plane, () => void rebuild())
watch(() => store.currentSlice, applySlices)
watch(() => store.galleryChannels, applyChannels, { deep: true })
watch(() => store.centerPosition.join(':'), () => {
  if (mainInstance.value) moveCameraTarget(mainInstance.value, store.centerPosition)
  for (const plane of otherPlanes.value) {
    const thumbnail = thumbnailInstances[plane]
    if (thumbnail) moveCameraTarget(thumbnail, store.centerPosition)
  }
})
watch(
  () => [
    store.cursorPosition,
    store.selection,
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
.main-viewport { position: absolute; inset: 0; overflow: hidden; }
.main-canvas { display: block; width: 100%; height: 100%; }
.context-panel { display: flex; flex-direction: column; gap: 12px; width: 100%; height: 100%; }
.context-view { display: flex; min-height: 0; flex: 1; flex-direction: column; align-items: stretch; gap: 5px; padding: 0; border: 0; background: transparent; color: var(--galavi-text); font: 600 11px var(--galavi-font-mono); letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
.context-canvas-wrap { position: relative; display: block; min-height: 0; flex: 1; overflow: hidden; border: 1px solid var(--galavi-border); border-radius: 2px; background: #000; }
.context-view:hover .context-canvas-wrap { border-color: var(--galavi-accent); }
.context-view canvas { display: block; width: 100%; height: 100%; }
.channel-panel { width: 100%; }
.channel-row { padding: 11px 0; border-top: 1px solid var(--galavi-border); }
.channel-row:first-child { border-top: 0; padding-top: 0; }
.channel-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--galavi-text); font: 600 12px var(--galavi-font-mono); }
.channel-heading > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visibility-button { display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; flex: 0 0 auto; padding: 0; border: 1px solid var(--galavi-border); border-radius: 2px; background: transparent; color: var(--galavi-text-dim); cursor: pointer; }
.visibility-button.active { border-color: var(--galavi-accent); color: var(--galavi-accent); background: var(--galavi-accent-soft); }
.channel-color { width: 26px; height: 26px; flex: 0 0 auto; padding: 0; border: 1px solid var(--galavi-border); border-radius: 2px; background: transparent; cursor: pointer; }
.channel-color::-webkit-color-swatch-wrapper { padding: 2px; }
.channel-color::-webkit-color-swatch { border: 0; border-radius: 1px; }
.channel-color::-moz-color-swatch { border: 0; border-radius: 1px; }
.slider-dock { position: absolute; z-index: 65; right: 16px; bottom: 16px; left: 16px; }
.mode-loading { position: absolute; inset: 0; z-index: 90; display: grid; place-items: center; color: var(--galavi-text-dim); background: var(--app-bg); }
</style>

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
      <SliceSelectionOverlay
        :plane="store.plane"
        :state="mainState"
        :normal-position="store.positionForSlice(store.plane, store.currentSlice)"
        :enabled="store.isToolEnabled('selector')"
        :unit="unit"
      />
      <RulerOverlay
        v-if="store.isToolEnabled('ruler')"
        :units-per-pixel="unitsPerPixel"
        :unit="unit"
        :reset-nonce="store.rulerResetNonce"
        :right-inset="276"
      />
      <MagnifierCanvas
        v-if="store.isToolEnabled('magnifier')"
        :visible="Boolean(store.cursorPosition)"
        :x="magnifierPosition.x"
        :y="magnifierPosition.y"
        @ready="onMagnifierReady"
        @resize="onMagnifierResize"
      />
    </div>

    <aside class="context-panel" aria-label="Other slice views">
      <button v-for="plane in otherPlanes" :key="plane" type="button" class="context-view" @click="store.setPlane(plane)">
        <span class="context-canvas-wrap">
          <canvas :ref="(element) => setThumbnailCanvas(plane, element as HTMLCanvasElement | null)"></canvas>
          <SliceSelectionOverlay
            :plane="plane"
            :state="thumbnailStates[plane]"
            :normal-position="store.positionForSlice(plane, store.sliceByPlane[plane])"
            :enabled="false"
            :show-label="false"
            :unit="unit"
          />
        </span>
        <span>{{ planeLabel(plane) }}</span>
      </button>
    </aside>

    <aside class="channel-panel" aria-label="Channel controls">
      <h2>Channels</h2>
      <div v-for="channel in store.galleryChannels" :key="channel.index" class="channel-row">
        <div class="channel-heading">
          <button type="button" class="visibility-button" :class="{ active: channel.visible }" :title="channel.visible ? 'Hide channel' : 'Show channel'" @click="channel.visible = !channel.visible">
            <el-icon :size="15"><component :is="channel.visible ? View : Hide" /></el-icon>
          </button>
          <el-color-picker v-model="channel.color" size="small" :show-alpha="false" />
          <span>{{ channel.label }}</span>
        </div>
        <DualRangeSlider
          :model-value="[channel.contrastMin, channel.contrastMax]"
          :bounds="channel.bounds"
          :step="Math.max(1e-5, channel.bounds[1] / 1000)"
          scale="log"
          @update:model-value="(range) => setChannelContrast(channel.index, range)"
        />
      </div>
    </aside>

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
import { cameraDistance, type Galavi, type State, type Vec2, type Vec3 } from 'galavi'
import { Hide, View } from '@element-plus/icons-vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import {
  physicalFraming,
  planeLabel,
  sliceCount,
  sliceDef,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'
import { buildCompositor, buildSliceViewer, compositorLayerId } from '@/galavi/gallery'
import { useVISoRStore } from '@/stores/visor'
import { screenToSlicePhysical } from '@/utils/viewCoordinates'
import DualRangeSlider from '@/components/viewer/DualRangeSlider.vue'
import GallerySlider from '@/components/viewer/GallerySlider.vue'
import MagnifierCanvas from '@/components/viewer/MagnifierCanvas.vue'
import RulerOverlay from '@/components/viewer/RulerOverlay.vue'
import SliceSelectionOverlay from '@/components/viewer/SliceSelectionOverlay.vue'

const props = defineProps<{ ctx: SetupContext }>()
const store = useVISoRStore()
const mainViewport = ref<HTMLElement | null>(null)
const mainCanvas = ref<HTMLCanvasElement | null>(null)
const slider = ref<InstanceType<typeof GallerySlider> | null>(null)
const mainInstance = shallowRef<Galavi | null>(null)
const mainState = ref<State | null>(null)
const thumbnailCanvases: Partial<Record<SlicePlane, HTMLCanvasElement | null>> = {}
const thumbnailInstances: Partial<Record<SlicePlane, Galavi>> = {}
const thumbnailStates = reactive<Record<SlicePlane, State | null>>({ xy: null, yz: null, xz: null })
const magnifierPosition = reactive({ x: 0, y: 0 })
let previewCanvas: HTMLCanvasElement | null = null
let preview: Galavi | null = null
let magnifierCanvas: HTMLCanvasElement | null = null
let magnifier: Galavi | null = null
let magnifierSize = 180
let rebuildToken = 0
let previewToken = 0
let magnifierToken = 0
let unsubscribe: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined

const otherPlanes = computed<SlicePlane[]>(() => (['xy', 'xz', 'yz'] as SlicePlane[]).filter((plane) => plane !== store.plane))
const sliceMax = computed(() => Math.max(0, sliceCount(props.ctx, store.plane) - 1))
const unit = computed(() => physicalFraming(props.ctx).unit)
const unitsPerPixel = computed(() => mainState.value
  ? cameraDistance(mainState.value.exploration.camera) / Math.max(mainCanvas.value?.clientHeight ?? 1, 1)
  : 0)

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
    thumbnailStates[plane] = null
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
  target[sliceDef(store.plane).axisMap[2]] = store.positionForSlice(store.plane, store.currentSlice)
  return target
}

function updateMainState(state: State) {
  mainState.value = state
  const target = currentPhysicalTarget(state)
  if (target.some((value, axis) => Math.abs(value - store.centerPosition[axis]) > 1e-5)) store.setCenter(target)
  const probe = activeChannel()
  const resolution = probe
    ? mainInstance.value?.view('main').getResolution(compositorLayerId(probe.index))
    : undefined
  store.setReadouts(
    `${target[0].toFixed(1)}, ${target[1].toFixed(1)}, ${target[2].toFixed(1)} ${unit.value}`,
    resolution ? `${resolution.unitsPerPixel.toFixed(2)} ${unit.value}/px` : '—',
  )
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
  magnifier?.destroy()
  magnifier = null
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
      contrastLimits: channel ? [channel.contrastMin, channel.contrastMax] : undefined,
      sliceIndex: store.sliceByPlane[plane],
      canvas,
    })
    if (token !== rebuildToken) {
      thumbnail.destroy()
      return
    }
    moveCameraTarget(thumbnail, store.centerPosition)
    thumbnailInstances[plane] = thumbnail
    thumbnailStates[plane] = thumbnail.getState()
  }

  await rebuildPreview()
  if (store.isToolEnabled('magnifier')) await rebuildMagnifier()
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
      layer.setRender({ color: channel.color, contrastLimits: [channel.contrastMin, channel.contrastMax], visible: true })
    }
  }
  if (preview) updateSingleChannelLayer(preview)
  if (magnifier) {
    for (const entry of store.galleryChannels) {
      magnifier.layer(compositorLayerId(entry.index))?.setRender({
        color: entry.color,
        contrastLimits: [entry.contrastMin, entry.contrastMax],
        visible: entry.visible,
      })
    }
  }
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
  for (const channel of store.galleryChannels) {
    mainInstance.value?.layer(compositorLayerId(channel.index))?.setOptions({ sliceIndex: store.currentSlice })
    magnifier?.layer(compositorLayerId(channel.index))?.setOptions({ sliceIndex: store.currentSlice })
  }
  for (const plane of otherPlanes.value) {
    thumbnailInstances[plane]?.layer('slice')?.setOptions({ sliceIndex: store.sliceByPlane[plane] })
  }
  updateMainState(mainInstance.value?.getState() ?? mainState.value!)
}

function setChannelContrast(index: number, range: Vec2) {
  const channel = store.galleryChannels.find((entry) => entry.index === index)
  if (!channel) return
  channel.contrastMin = range[0]
  channel.contrastMax = range[1]
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
  if (index !== null) preview?.layer('slice')?.setOptions({ sliceIndex: index })
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
    store.plane,
    bounds.width,
    bounds.height,
    store.positionForSlice(store.plane, store.currentSlice),
  )
}

function onPointerMove(event: PointerEvent) {
  const position = pointerPosition(event)
  const bounds = mainViewport.value?.getBoundingClientRect()
  if (!position || !bounds) return
  magnifierPosition.x = event.clientX - bounds.left
  magnifierPosition.y = event.clientY - bounds.top
  store.setCursor(position)
  syncMagnifier()
}

function onPointerLeave() {
  store.setCursor(null)
}

function recenterFromEvent(event: MouseEvent) {
  if (!store.isToolEnabled('selector')) return
  const position = pointerPosition(event)
  if (position) store.setCenter(position)
}

function magnifierDistance(): number {
  const definition = sliceDef(store.plane)
  const scale = props.ctx.sliceSources[store.plane].pyramid.levels[0].scale[definition.axisMap[1]]
  return Math.max(scale * magnifierSize, scale)
}

async function rebuildMagnifier() {
  if (!magnifierCanvas || !store.isToolEnabled('magnifier')) return
  const token = ++magnifierToken
  magnifier?.destroy()
  const next = await buildCompositor({
    ctx: props.ctx,
    plane: store.plane,
    channels: store.galleryChannels,
    sliceIndex: store.currentSlice,
    canvas: magnifierCanvas,
  })
  if (token !== magnifierToken) {
    next.destroy()
    return
  }
  magnifier = next
  applyChannels()
  syncMagnifier()
}

function syncMagnifier() {
  if (!magnifier || !store.cursorPosition) return
  const definition = sliceDef(store.plane)
  const state = magnifier.getState()
  const target = [...store.cursorPosition] as Vec3
  const position = [...target] as Vec3
  position[definition.axisMap[2]] += magnifierDistance()
  state.exploration.camera.target = target
  state.exploration.camera.position = position
  magnifier.setState(state)
}

function onMagnifierReady(canvas: HTMLCanvasElement) {
  magnifierCanvas = canvas
  void rebuildMagnifier()
}

function onMagnifierResize(size: number) {
  magnifierSize = size
  syncMagnifier()
}

function observeCanvases() {
  resizeObserver?.disconnect()
  resizeObserver = new ResizeObserver(() => {
    mainInstance.value?.requestRender()
    preview?.requestRender()
    magnifier?.requestRender()
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
  magnifierToken += 1
  window.removeEventListener('keydown', onKeydown)
  unsubscribe?.()
  resizeObserver?.disconnect()
  mainInstance.value?.destroy()
  destroyThumbnails()
  preview?.destroy()
  magnifier?.destroy()
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
    if (thumbnail) {
      moveCameraTarget(thumbnail, store.centerPosition)
      thumbnailStates[plane] = thumbnail.getState()
    }
  }
})
watch(() => store.isToolEnabled('magnifier'), (enabled) => {
  if (enabled) void rebuildMagnifier()
  else {
    magnifierToken += 1
    magnifier?.destroy()
    magnifier = null
    magnifierCanvas = null
  }
})
</script>

<style scoped>
.slice-mode { position: absolute; inset: 0; overflow: hidden; background: #000; }
.main-viewport { position: absolute; inset: 0; overflow: hidden; }
.main-canvas { display: block; width: 100%; height: 100%; }
.context-panel, .channel-panel { position: absolute; z-index: 55; top: 16px; bottom: 82px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: rgba(10, 14, 20, 0.9); box-shadow: var(--shadow-lg); backdrop-filter: blur(12px); }
.context-panel { left: 16px; display: flex; width: 214px; flex-direction: column; gap: 12px; padding: 10px; }
.context-view { display: flex; min-height: 0; flex: 1; flex-direction: column; align-items: stretch; gap: 5px; padding: 0; border: 0; background: transparent; color: var(--c-text); font-size: 11px; font-weight: 600; cursor: pointer; }
.context-canvas-wrap { position: relative; display: block; min-height: 0; flex: 1; overflow: hidden; border: 1px solid var(--c-border); border-radius: 3px; background: #000; }
.context-view:hover .context-canvas-wrap { border-color: var(--c-accent); }
.context-view canvas { display: block; width: 100%; height: 100%; }
.channel-panel { right: 16px; width: 260px; padding: 12px; overflow-y: auto; }
.channel-panel h2 { margin: 0 0 12px; color: var(--c-text-strong); font-size: 13px; letter-spacing: 0; }
.channel-row { padding: 11px 0; border-top: 1px solid var(--c-divider); }
.channel-heading { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; color: var(--c-text-strong); font-size: 12px; font-weight: 600; }
.channel-heading > span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.visibility-button { display: inline-flex; width: 26px; height: 26px; align-items: center; justify-content: center; flex: 0 0 auto; padding: 0; border: 1px solid var(--c-border); border-radius: 3px; background: var(--c-bg-soft); color: var(--c-text-faint); cursor: pointer; }
.visibility-button.active { border-color: var(--c-accent); color: var(--c-accent); background: var(--c-accent-soft); }
.slider-dock { position: absolute; z-index: 65; right: 16px; bottom: 16px; left: 16px; }
.mode-loading { position: absolute; inset: 0; z-index: 90; display: grid; place-items: center; color: var(--c-text-muted); background: var(--c-bg); }
@media (max-width: 900px) { .context-panel { width: 164px; } .channel-panel { width: 220px; } }
</style>
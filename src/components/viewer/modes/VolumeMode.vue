<template>
  <div ref="stage" class="volume-mode" @pointermove="onPointerMove" @pointerleave="onPointerLeave">
    <canvas ref="mainCanvas" class="main-canvas"></canvas>

    <div class="navigator-overlay" aria-label="Navigator">
      <canvas ref="navigatorCanvas"></canvas>
    </div>
    <div class="camera-mode" role="group" aria-label="Camera control">
      <button type="button" :class="{ active: liveState?.exploration.camera.navMode === 'orbit' }" title="Orbit camera" aria-label="Orbit camera" @click="setCameraMode('orbit')">
        <el-icon :size="16"><RefreshRight /></el-icon>
      </button>
      <button type="button" :class="{ active: liveState?.exploration.camera.navMode === 'fly' }" title="Fly camera" aria-label="Fly camera" @click="setCameraMode('fly')">
        <el-icon :size="16"><Position /></el-icon>
      </button>
    </div>

    <VolumeSelectionOverlay
      :selection="store.selection"
      :camera="liveState?.exploration.camera ?? null"
      :width="viewport.width"
      :height="viewport.height"
    />
    <RulerOverlay
      v-if="store.isToolEnabled('ruler')"
      :units-per-pixel="unitsPerPixel"
      :unit="unit"
      :reset-nonce="store.rulerResetNonce"
    />
    <MagnifierCanvas
      v-if="store.isToolEnabled('magnifier')"
      :visible="Boolean(store.cursorPosition)"
      :x="magnifierPosition.x"
      :y="magnifierPosition.y"
      @ready="onMagnifierReady"
      @resize="onMagnifierResize"
    />

    <div v-if="!instance" class="mode-loading">Preparing volume...</div>
  </div>
</template>

<script setup lang="ts">
import { cameraDistance, type Galavi, type State, type Vec2, type Vec3 } from 'galavi'
import { Position, RefreshRight } from '@element-plus/icons-vue'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { bootstrap, physicalFraming, type SetupContext } from '@/galavi-setup'
import { useVISoRStore } from '@/stores/visor'
import { screenToVolumeTargetPlane, volumeUnitsPerPixel } from '@/utils/viewCoordinates'
import MagnifierCanvas from '@/components/viewer/MagnifierCanvas.vue'
import RulerOverlay from '@/components/viewer/RulerOverlay.vue'
import VolumeSelectionOverlay from '@/components/viewer/VolumeSelectionOverlay.vue'

const props = defineProps<{ ctx: SetupContext }>()
const store = useVISoRStore()
const stage = ref<HTMLElement | null>(null)
const mainCanvas = ref<HTMLCanvasElement | null>(null)
const navigatorCanvas = ref<HTMLCanvasElement | null>(null)
const instance = ref<Galavi | null>(null)
const liveState = ref<State | null>(null)
const viewport = reactive({ width: 0, height: 0 })
const magnifierPosition = reactive({ x: 0, y: 0 })
let magnifierCanvas: HTMLCanvasElement | null = null
let magnifier: Galavi | null = null
let magnifierSize = 180
let unsubscribe: (() => void) | undefined
let resizeObserver: ResizeObserver | undefined
let mainToken = 0
let magnifierToken = 0

const unit = computed(() => physicalFraming(props.ctx).unit)
const unitsPerPixel = computed(() => liveState.value
  ? volumeUnitsPerPixel(liveState.value.exploration.camera, viewport.height)
  : 0)

function measure() {
  viewport.width = mainCanvas.value?.clientWidth ?? 0
  viewport.height = mainCanvas.value?.clientHeight ?? 0
  instance.value?.requestRender()
  magnifier?.requestRender()
}

function updateReadouts(state: State) {
  liveState.value = state
  const target = state.exploration.camera.target
  const height = mainCanvas.value?.clientHeight ?? 0
  const cameraResolution = height > 0 ? volumeUnitsPerPixel(state.exploration.camera, height) : 0
  const viewResolution = instance.value?.view('volume').getResolution('volume')?.unitsPerPixel
  const resolution = viewResolution && viewResolution > 0 ? viewResolution : cameraResolution
  const positionLabel = `${target[0].toFixed(1)}, ${target[1].toFixed(1)}, ${target[2].toFixed(1)} ${unit.value}`
  const resolutionLabel = resolution > 0 ? `${resolution.toFixed(2)} ${unit.value}/px` : '—'
  store.setReadouts(positionLabel, resolutionLabel)
}

function applyImagery() {
  const galavi = instance.value
  if (!galavi) return
  galavi.layer('volume')?.setOptions({ selection: { c: store.channel } })
  galavi.layer('volume')?.setRender({ contrastLimits: [store.contrastMin, store.contrastMax] as Vec2 })
  if (magnifier) {
    magnifier.layer('volume')?.setOptions({ selection: { c: store.channel } })
    magnifier.layer('volume')?.setRender({ contrastLimits: [store.contrastMin, store.contrastMax] as Vec2 })
  }
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
  unsubscribe = galavi.subscribe(updateReadouts)
  updateReadouts(galavi.getState())
  applyImagery()
  measure()
}

function pointerPhysicalPosition(event: PointerEvent): Vec3 | null {
  const canvas = mainCanvas.value
  const state = liveState.value
  if (!canvas || !state || event.target === navigatorCanvas.value) return null
  const bounds = canvas.getBoundingClientRect()
  return screenToVolumeTargetPlane(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    state.exploration.camera,
    bounds.width,
    bounds.height,
  )
}

function onPointerMove(event: PointerEvent) {
  const bounds = stage.value?.getBoundingClientRect()
  if (!bounds) return
  magnifierPosition.x = event.clientX - bounds.left
  magnifierPosition.y = event.clientY - bounds.top
  const position = pointerPhysicalPosition(event)
  if (!position) return
  store.setCursor(position)
  syncMagnifier()
}

function onPointerLeave() {
  store.setCursor(null)
}

function setCameraMode(mode: 'orbit' | 'fly') {
  instance.value?.setNavMode(mode)
}

async function buildMagnifier() {
  if (!magnifierCanvas || !store.isToolEnabled('magnifier')) return
  const currentToken = ++magnifierToken
  magnifier?.destroy()
  magnifier = await bootstrap(props.ctx, magnifierCanvas, {}, 'volume', [])
  if (currentToken !== magnifierToken) {
    magnifier.destroy()
    magnifier = null
    return
  }
  magnifier.setActiveView('volume')
  applyImagery()
  syncMagnifier()
}

function syncMagnifier() {
  const cursor = store.cursorPosition
  const sourceState = liveState.value
  if (!magnifier || !cursor || !sourceState) return
  const state = magnifier.getState()
  const sourceCamera = sourceState.exploration.camera
  const sourceDistance = cameraDistance(sourceCamera) || 1
  const forward: Vec3 = [
    (sourceCamera.target[0] - sourceCamera.position[0]) / sourceDistance,
    (sourceCamera.target[1] - sourceCamera.position[1]) / sourceDistance,
    (sourceCamera.target[2] - sourceCamera.position[2]) / sourceDistance,
  ]
  const finestScale = Math.max(...props.ctx.volumeInfo.pyramid.levels[0].scale)
  const verticalSpan = Math.max(finestScale * magnifierSize, finestScale)
  const distance = verticalSpan / (2 * Math.tan(Math.PI / 8))
  state.exploration.camera.target = [...cursor] as Vec3
  state.exploration.camera.position = [
    cursor[0] - forward[0] * distance,
    cursor[1] - forward[1] * distance,
    cursor[2] - forward[2] * distance,
  ]
  state.exploration.camera.up = sourceCamera.up ? [...sourceCamera.up] as Vec3 : [0, 1, 0]
  magnifier.setState(state)
}

function onMagnifierReady(canvas: HTMLCanvasElement) {
  magnifierCanvas = canvas
  void buildMagnifier()
}

function onMagnifierResize(size: number) {
  magnifierSize = size
  magnifier?.requestRender()
  syncMagnifier()
}

onMounted(() => {
  void build()
  resizeObserver = new ResizeObserver(measure)
  if (mainCanvas.value) resizeObserver.observe(mainCanvas.value)
})

onBeforeUnmount(() => {
  mainToken += 1
  magnifierToken += 1
  unsubscribe?.()
  resizeObserver?.disconnect()
  instance.value?.destroy()
  magnifier?.destroy()
  store.setCursor(null)
  store.clearReadouts()
})

watch(() => [store.channel, store.contrastMin, store.contrastMax], applyImagery)
watch(() => store.isToolEnabled('magnifier'), (enabled) => {
  if (enabled) void buildMagnifier()
  else {
    magnifier?.destroy()
    magnifier = null
    magnifierCanvas = null
  }
})
</script>

<style scoped>
.volume-mode { position: absolute; inset: 0; overflow: hidden; background: #000; }
.main-canvas { display: block; width: 100%; height: 100%; }
.navigator-overlay { position: absolute; z-index: 20; top: 16px; left: 16px; width: clamp(140px, 17vw, 220px); aspect-ratio: 1; overflow: hidden; border: 1px solid var(--c-border-strong); border-radius: var(--radius-sm); background: #000; box-shadow: var(--shadow-lg); }
.navigator-overlay canvas { display: block; width: 100%; height: 100%; }
.camera-mode { position: absolute; z-index: 40; top: calc(24px + clamp(140px, 17vw, 220px)); left: 16px; display: inline-flex; gap: 2px; padding: 2px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: rgba(8, 11, 16, 0.84); }
.camera-mode button { display: inline-flex; width: 30px; height: 27px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--c-text-muted); cursor: pointer; }
.camera-mode button:hover { color: var(--c-text-strong); }
.camera-mode button.active { background: var(--c-accent-soft); color: var(--c-accent); }
.mode-loading { position: absolute; inset: 0; display: grid; place-items: center; color: var(--c-text-muted); background: var(--c-bg); }
</style>
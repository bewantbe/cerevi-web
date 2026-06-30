<template>
  <div class="viewer">
    <!-- Loading state -->
    <div v-if="!visorStore.currentSpecimen" class="loading-state">
      <div class="welcome-card">
        <div class="welcome-content">
          <h2>{{ loadingTitle }}</h2>
          <p>{{ loadingMessage }}</p>
          <button v-if="specimenNotFound" class="ghost-btn" @click="goHome">Back to Home</button>
        </div>
      </div>
    </div>

    <div v-else class="viewer-content">
      <div class="viewer-main">
        <!-- Left stage: Explorer grid OR Compositor canvas -->
        <div class="viewer-stage">
          <!-- Explorer: 1 + 4 view grid -->
          <div v-show="mode === 'explorer'" class="explorer-container">
            <div class="grid">
              <!-- Main view -->
              <div class="main-cell" @click="handleViewClick(layout.main)">
                <canvas ref="canvasMain" class="main-canvas"></canvas>
                <div
                  v-if="!slices[layout.main as keyof typeof slices]"
                  class="view-label-overlay"
                  :class="{ active: liveState.activeView === layout.main }"
                >
                  {{ getViewLabel(layout.main) }}
                </div>
                <!-- Slice control overlay for slice views -->
                <div
                  v-if="slices[layout.main as keyof typeof slices]"
                  class="slice-control"
                  @click.stop
                >
                  <label>{{ slices[layout.main as keyof typeof slices].label }}</label>
                  <el-slider
                    :model-value="slices[layout.main as keyof typeof slices].value"
                    :min="0"
                    :max="slices[layout.main as keyof typeof slices].max"
                    :step="1"
                    class="slice-slider"
                    @input="(val: number | number[]) => setSliceFromSlider(layout.main, val)"
                    @change="(val: number | number[]) => setSliceFromSlider(layout.main, val)"
                  />
                  <span class="slice-value">{{ slices[layout.main as keyof typeof slices].value }}</span>
                </div>
              </div>

              <!-- Side views -->
              <div class="side-stack">
                <div
                  v-for="viewName in layout.sides"
                  :key="viewName"
                  class="side-cell"
                  @click="handleViewClick(viewName)"
                >
                  <canvas :ref="(el: any) => setCanvasRef(viewName, el as HTMLCanvasElement)" class="side-canvas"></canvas>
                  <div class="view-label-overlay" :class="{ active: liveState.activeView === viewName }">
                    {{ getViewLabel(viewName) }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Compositor: single 2D slice canvas -->
          <div v-show="mode === 'compositor'" class="compositor-container">
            <CompositorCanvas
              ref="compositorCanvasRef"
              :perspective="compPerspective"
              :slice-value="currentCompSlice.value"
              :slice-max="currentCompSlice.max"
              :slice-label="currentCompSlice.label"
              @update:perspective="onCompositorPerspective"
              @slice="onCompositorSlice"
            />
          </div>
        </div>

        <!-- Right tabbed panel -->
        <aside class="viewer-panel">
          <div class="panel-tabs" role="tablist">
            <button
              type="button"
              class="panel-tab"
              role="tab"
              :class="{ active: mode === 'explorer' }"
              @click="goMode('explorer')"
            >Explorer</button>
            <button
              type="button"
              class="panel-tab"
              role="tab"
              :class="{ active: mode === 'compositor' }"
              @click="goMode('compositor')"
            >Compositor</button>
          </div>

          <div class="panel-stack">
            <div v-show="mode === 'explorer'" class="panel-pane">
              <ExplorerPanel
                :get-galavi="getGalavi"
                :active-view="liveState.activeView"
                :channels="channels"
                :channel="channel"
                :channel-labels="channelLabels"
                :contrast-min="contrastMin"
                :contrast-max="contrastMax"
                :contrast-bounds="contrastBounds"
                :contrast-step="contrastStep"
                @update:channel="onChannelModelUpdate"
                @update:contrast-min="onContrastMinModelUpdate"
                @update:contrast-max="onContrastMaxModelUpdate"
                @channel-change="onPanelChannelChange"
                @contrast-change="onPanelContrastChange"
              />
            </div>
            <div v-show="mode === 'compositor'" class="panel-pane">
              <CompositorPanel
                :channels="compChannels"
                @channel-color="setCompChannelColor"
                @channel-contrast="setCompChannelContrast"
                @channel-visible="setCompChannelVisible"
              />
            </div>
          </div>
        </aside>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVISoRStore } from '@/stores/visor'
import type { Galavi, State, Vec2 } from 'galavi'
import { cameraDistance, pickPyramidLevel } from 'galavi'
import {
  type ConfiguredViewName,
  type SetupContext,
  isConfiguredViewName,
  bootstrap,
  bootstrapCompositor,
  buildSetupContext,
  getViewLevelRange,
  SLICE_DEFS,
} from '@/galavi-setup'
import { useLayout } from '@/composables/useLayout'
import { useSliceState } from '@/composables/useSliceState'
import { useCompositorState, type CompositorSliceEntry } from '@/composables/useCompositorState'
import ExplorerPanel from '@/components/controls/ExplorerPanel.vue'
import CompositorPanel from '@/components/controls/CompositorPanel.vue'
import CompositorCanvas from '@/components/compositor/CompositorCanvas.vue'

type ViewerMode = 'explorer' | 'compositor'

interface Props { specimenId: string; mode?: string }
const props = defineProps<Props>()
const router = useRouter()
const visorStore = useVISoRStore()

const mode = computed<ViewerMode>(() => (props.mode === 'compositor' ? 'compositor' : 'explorer'))

function goMode(next: ViewerMode) {
  if (next === mode.value) return
  router.push(`/specimen/${props.specimenId}/${next}`)
}

// ============================================================================
// GALAVI INSTANCE
// ============================================================================

const galavi = ref<Galavi | undefined>()
const getGalavi = () => galavi.value

// ============================================================================
// CANVAS REFS
// ============================================================================

const canvasMain = ref<HTMLCanvasElement | null>(null)
const canvasRefs = reactive<Record<string, HTMLCanvasElement | null>>({})
function setCanvasRef(name: string, el: HTMLCanvasElement | null) {
  canvasRefs[name] = el
}

// ============================================================================
// COMPOSABLES
// ============================================================================

const { layout, handleViewClick } = useLayout(
  getGalavi,
  () => canvasMain.value,
  canvasRefs,
)

const setupCtx = ref<SetupContext | null>(null)

const {
  channels, channel, contrastBounds, contrastStep,
  contrastMin, contrastMax, slices,
  setSetupContext, setSliceValue,
  onChannelChange, onContrastChange,
} = useSliceState(getGalavi)

// ============================================================================
// COMPOSITOR INSTANCE + STATE (built lazily on first activation)
// ============================================================================

const compositorGalavi = ref<Galavi | undefined>()
const getCompositorGalavi = () => compositorGalavi.value
const compositorCanvasRef = ref<InstanceType<typeof CompositorCanvas> | null>(null)
let compositorBuilt = false

const {
  perspective: compPerspective,
  channels: compChannels,
  slices: compSlices,
  setSetupContext: setCompositorContext,
  applyAll: applyCompositorAll,
  setChannelColor: setCompChannelColor,
  setChannelContrast: setCompChannelContrast,
  setChannelVisible: setCompChannelVisible,
  setSliceValue: setCompSliceValue,
  setPerspective: setCompPerspective,
} = useCompositorState(getCompositorGalavi, () => compositorCanvasRef.value?.getCanvas() ?? null)

const EMPTY_SLICE: CompositorSliceEntry = { label: '', value: 0, max: 0, axisMap: [0, 1, 2] }
const currentCompSlice = computed<CompositorSliceEntry>(
  () => compSlices[compPerspective.value] ?? EMPTY_SLICE,
)

function onCompositorPerspective(key: 'xy' | 'yz' | 'xz') {
  setCompPerspective(key)
}
function onCompositorSlice(value: number) {
  setCompSliceValue(compPerspective.value, value)
}

/** The galavi instance backing the currently active mode. */
const activeGalavi = computed(() => (mode.value === 'compositor' ? compositorGalavi.value : galavi.value))

// ============================================================================
// LIVE STATE — driven by galavi.subscribe + rAF
// ============================================================================

const liveState = reactive({
  cameraTarget: [0, 0, 0] as [number, number, number],
  cameraPosition: [0, 0, 0] as [number, number, number],
  sceneSize: [1, 1, 1] as [number, number, number],
  lodMode: 'auto' as 'auto' | 'manual',
  lodLevel: 0,
  unit: 'μm',
  activeView: undefined as string | undefined,
})

function updateLive(s: State) {
  const t = s.exploration.camera.target
  const p = s.exploration.camera.position
  const sz = s.physical?.spatial?.size ?? [1, 1, 1]
  liveState.cameraTarget = [t[0], t[1], t[2]]
  liveState.cameraPosition = [p[0], p[1], p[2]]
  liveState.sceneSize = [sz[0], sz[1], sz[2]]
  liveState.lodMode = s.exploration.lod.mode
  liveState.lodLevel = s.exploration.lod.level
  liveState.unit = s.physical?.spatial?.unit ?? 'μm'
  liveState.activeView = activeGalavi.value?.getActiveView()
  visorStore.setExplorerReadouts(positionReadout.value, resolutionReadout.value)
}

function syncLiveFromGalavi() {
  const inst = activeGalavi.value
  if (!inst) return
  updateLive(inst.getState())
}

function getViewLabel(viewName: string) {
  return galavi.value?.getViewConfig(viewName)?.label ?? viewName
}

// ============================================================================
// READOUTS
// ============================================================================

const SLICE_KEYS = new Set(SLICE_DEFS.map(d => d.key))
const SLICE_AXIS_MAP = new Map(SLICE_DEFS.map(d => [d.key, d.axisMap]))

/** Scene extent (µm) along a view's framing axes: in-plane span for slices,
 *  overall span for the volume. Drives the auto-LOD scale calculation. */
function sceneExtentForView(view: string | undefined, sz: readonly number[]): number {
  if (view && SLICE_KEYS.has(view)) {
    const am = SLICE_AXIS_MAP.get(view)!
    return Math.max(sz[am[0]], sz[am[1]], 1e-6)
  }
  return Math.max(sz[0], sz[1], sz[2], 1e-6)
}

const effectiveLodLevel = computed(() => {
  if (liveState.lodMode === 'manual') return liveState.lodLevel
  const active = liveState.activeView
  if (!active) return liveState.lodLevel
  const sceneExtent = sceneExtentForView(active, liveState.sceneSize)
  const dist = cameraDistance({
    position: liveState.cameraPosition,
    target: liveState.cameraTarget,
  } as any)
  if (dist <= 0) return liveState.lodLevel
  const effectiveScale = sceneExtent / dist
  if (!setupCtx.value) return liveState.lodLevel
  const range = getViewLevelRange(active, setupCtx.value)
  return pickPyramidLevel(effectiveScale, range)
})

const resolutionReadout = computed(() => {
  const ctx = setupCtx.value
  if (!ctx) return '—'
  const active = liveState.activeView
  const isSlice = active ? SLICE_KEYS.has(active) : false
  const info =
    isSlice && (active === 'xy' || active === 'xz' || active === 'yz')
      ? ctx.sliceSources[active].info
      : ctx.volumeInfo
  const level = effectiveLodLevel.value
  const idx = Math.min(level, info.levelScales.length - 1)
  const scale = info.levelScales[idx]
  if (!scale) return '—'
  // Display in-plane resolution: smallest of x/y for slices, max for volume.
  const um = isSlice ? Math.max(scale[0], scale[1]) : Math.max(scale[0], scale[1], scale[2])
  return `${um.toFixed(2)} μm/px`
})

const positionReadout = computed(() => {
  const [x, y, z] = liveState.cameraTarget
  const u = liveState.unit
  return `${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)} ${u}`
})

const channelLabels = computed<string[]>(() => {
  const info = setupCtx.value?.volumeInfo
  if (!info) return []
  if (info.omeroChannelLabels?.length) return info.omeroChannelLabels
  const c = info.selectionDims.find((d) => d.name === 'c')
  if (!c) return []
  return c.labels?.length ? c.labels : Array.from({ length: c.size }, (_, i) => `Channel ${i}`)
})

// ============================================================================
// PANEL EVENT HANDLERS
// ============================================================================

function onPanelChannelChange(_ch: number) {
  onChannelChange()
}

function onPanelContrastChange(_range: [number, number]) {
  onContrastChange()
}

function onChannelModelUpdate(value: number) {
  channel.value = value
}

function onContrastMinModelUpdate(value: number) {
  contrastMin.value = value
}

function onContrastMaxModelUpdate(value: number) {
  contrastMax.value = value
}

function setSliceFromSlider(viewName: string, value: number | number[]) {
  const normalized = Array.isArray(value) ? value[0] : value
  setSliceValue(viewName, normalized)
}

// ============================================================================
// LOADING / NAVIGATION
// ============================================================================

const isResolvingSpecimen = ref(true)
const specimenNotFound = computed(() => !isResolvingSpecimen.value && !visorStore.currentSpecimen)
const loadingTitle = computed(() => specimenNotFound.value ? 'Specimen not found' : 'Loading Specimen…')
const loadingMessage = computed(() => {
  if (specimenNotFound.value) return `No specimen matches "${props.specimenId}".`
  return `Preparing viewer for ${props.specimenId}`
})

function goHome() { router.push('/') }

// ============================================================================
// LIFECYCLE
// ============================================================================

let stopSubscribe: (() => void) | undefined
let liveFrame = 0

function startLiveLoop() {
  const tick = () => {
    syncLiveFromGalavi()
    liveFrame = window.requestAnimationFrame(tick)
  }
  if (!liveFrame) {
    liveFrame = window.requestAnimationFrame(tick)
  }
}

function detachLive() {
  stopSubscribe?.()
  stopSubscribe = undefined
  if (liveFrame) {
    window.cancelAnimationFrame(liveFrame)
    liveFrame = 0
  }
}

/** Subscribe readouts + rAF loop to a specific galavi instance. */
function attachLive(inst: Galavi | undefined) {
  detachLive()
  if (!inst) return
  stopSubscribe = inst.subscribe((s) => updateLive(s))
  syncLiveFromGalavi()
  startLiveLoop()
}

/** Set an instance's camera zoom (distance from target) along its view axis. */
function setInstanceDistance(inst: Galavi, dist: number) {
  const s = inst.getState()
  const cam = s.exploration.camera
  const dx = cam.position[0] - cam.target[0]
  const dy = cam.position[1] - cam.target[1]
  const dz = cam.position[2] - cam.target[2]
  const len = Math.hypot(dx, dy, dz)
  const ux = len > 0 ? dx / len : 0
  const uy = len > 0 ? dy / len : 0
  const uz = len > 0 ? dz / len : 1
  cam.position = [cam.target[0] + ux * dist, cam.target[1] + uy * dist, cam.target[2] + uz * dist]
  inst.setState(s)
}

/** Carry global target + apparent zoom (LOD) from one instance to another on
 *  mode switch. Resolution is derived from `sceneExtent / distance`, so to keep
 *  the on-screen resolution we transfer the target's pan center AND rescale the
 *  zoom distance to match the source's effective scale across differing view
 *  framings (volume span vs. slice in-plane span). */
function syncCamera(source: Galavi | undefined, target: Galavi | undefined) {
  if (!source || !target) return
  const s = source.getState()
  const sz = s.physical?.spatial?.size ?? [1, 1, 1]
  const srcDist = cameraDistance(s.exploration.camera)

  target.setTarget(s.exploration.camera.target)

  if (srcDist > 0) {
    const srcExtent = sceneExtentForView(source.getActiveView(), sz)
    const tgtExtent = sceneExtentForView(target.getActiveView(), sz)
    setInstanceDistance(target, (tgtExtent * srcDist) / srcExtent)
  }

  if (s.exploration.lod.mode === 'manual') target.setLodLevel(s.exploration.lod.level)
  else target.setLodMode('auto')
}

/** Build the Compositor instance on first use, mounting onto its canvas. */
async function ensureCompositorBuilt() {
  if (compositorBuilt || !setupCtx.value) return
  const canvas = compositorCanvasRef.value?.getCanvas()
  if (!canvas) return
  compositorBuilt = true
  const channelInits = compChannels.map((c) => ({
    color: c.color,
    contrastLimits: [c.contrastMin, c.contrastMax] as Vec2,
    visible: c.visible,
  }))
  compositorGalavi.value = await bootstrapCompositor(setupCtx.value, canvas, channelInits, compPerspective.value)
  applyCompositorAll()
  requestAnimationFrame(() => compositorGalavi.value?.setLodMode('auto'))
}

/** Activate a mode: reveal its canvas, sync camera, repaint, resume loop. */
async function activateMode(next: ViewerMode) {
  detachLive()
  if (next === 'compositor') await ensureCompositorBuilt()
  // Let v-show reveal the target canvas before we repaint it.
  await nextTick()
  const target = next === 'compositor' ? compositorGalavi.value : galavi.value
  const source = next === 'compositor' ? galavi.value : compositorGalavi.value
  syncCamera(source, target)
  target?.requestRender()
  attachLive(target)
}

watch(
  () => props.mode,
  () => {
    if (!setupCtx.value) return
    activateMode(mode.value)
  },
)

onMounted(async () => {
  isResolvingSpecimen.value = true
  visorStore.clearError()
  visorStore.clearVolumeInfo()

  if (Object.keys(visorStore.specimens).length === 0) {
    await visorStore.loadSpecimens()
  }

  if (!visorStore.currentSpecimen || visorStore.currentSpecimen.id !== props.specimenId) {
    visorStore.setCurrentSpecimen(props.specimenId)
  }
  if (!visorStore.currentSpecimen) {
    isResolvingSpecimen.value = false
    return
  }

  isResolvingSpecimen.value = false
  await nextTick()

  const ctx = await buildSetupContext(visorStore.currentSpecimen)
  setSetupContext(ctx)
  setCompositorContext(ctx)
  setupCtx.value = ctx
  visorStore.setVolumeInfo(ctx.volumeInfo)

  if (!isConfiguredViewName(layout.main)) return

  const sideCanvases: Record<string, HTMLCanvasElement> = {}
  const sideNames: ConfiguredViewName[] = []
  for (const name of layout.sides) {
    if (isConfiguredViewName(name) && canvasRefs[name]) {
      sideCanvases[name] = canvasRefs[name]!
      sideNames.push(name)
    }
  }

  galavi.value = await bootstrap(ctx, canvasMain.value!, sideCanvases, layout.main as ConfiguredViewName, sideNames)
  galavi.value.setActiveView('volume')
  onChannelChange()
  onContrastChange()
  galavi.value.setLodLevel(ctx.volumeInfo.levelRange[1])

  // If deep-linked into Compositor, build it now.
  if (mode.value === 'compositor') await ensureCompositorBuilt()

  // Subscribe live readouts to the active instance.
  attachLive(activeGalavi.value)

  requestAnimationFrame(() => {
    galavi.value?.setLodMode('auto')
  })
})

onUnmounted(() => {
  detachLive()
  visorStore.clearExplorerReadouts()
  visorStore.clearVolumeInfo()
  galavi.value?.destroy()
  compositorGalavi.value?.destroy()
})
</script>

<style scoped>
.viewer {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--c-bg);
  color: var(--c-text);
  box-sizing: border-box;
  padding-top: 44px;
}

/* Loading state */
.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  padding: 40px;
}

.welcome-card {
  max-width: 500px;
  text-align: center;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-xl);
  background: var(--c-bg-elev);
  padding: 32px;
}

.welcome-content h2 { color: var(--c-text-strong); margin: 0 0 12px 0; }
.welcome-content p { color: var(--c-text-muted); line-height: 1.6; margin: 0 0 20px 0; }

.ghost-btn {
  appearance: none;
  border: 1px solid var(--c-border-strong);
  background: var(--c-bg-elev);
  color: var(--c-text);
  padding: 8px 14px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font: inherit;
}

.ghost-btn:hover { background: var(--c-accent-soft); border-color: var(--c-accent); }

/* Viewer wrapper */
.viewer-content {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Main layout */
.viewer-main {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

/* Left stage holds either the Explorer grid or the Compositor canvas */
.viewer-stage {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  position: relative;
}

.compositor-container {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  padding: 8px;
  background: var(--c-bg);
}

/* Right tabbed panel */
.viewer-panel {
  width: 360px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--c-border);
  background: var(--c-bg);
  overflow: hidden;
}

.panel-tabs {
  display: flex;
  border-bottom: 1px solid var(--c-divider);
  flex: 0 0 auto;
}

.panel-tab {
  appearance: none;
  flex: 1;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--c-text-muted);
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 12px 10px;
  cursor: pointer;
  transition: color 0.12s, border-color 0.12s, background 0.12s;
}

.panel-tab:hover {
  color: var(--c-text);
}

.panel-tab.active {
  color: var(--c-text-strong);
  border-bottom-color: var(--c-accent);
  background: var(--c-accent-soft);
}

.panel-stack {
  flex: 1;
  min-height: 0;
  display: flex;
}

.panel-pane {
  flex: 1;
  min-height: 0;
  display: flex;
}

.explorer-container {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--c-bg);
}

/* Grid */
.grid {
  flex: 1;
  height: 100%;
  display: grid;
  grid-template-columns: 4fr 1fr;
  gap: 6px;
  padding: 8px;
  min-height: 0;
}

.main-cell, .side-cell {
  position: relative;
  background: #000;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-canvas, .side-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.side-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.side-cell { flex: 1 1 0; }

/* View label overlay */
.view-label-overlay {
  position: absolute;
  bottom: 6px;
  left: 6px;
  font-size: 11px;
  font-family: var(--font-mono);
  color: rgba(255, 255, 255, 0.78);
  background: rgba(0, 0, 0, 0.5);
  padding: 3px 7px;
  border-radius: 4px;
  pointer-events: none;
  letter-spacing: 0.02em;
}

.view-label-overlay.active {
  color: var(--c-accent);
  background: rgba(0, 0, 0, 0.65);
}

/* Slice control overlay */
.slice-control {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  padding: 24px 14px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.slice-control label {
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.slice-slider { flex: 1; }

.slice-value {
  color: #fff;
  font-size: 11px;
  font-family: var(--font-mono);
  min-width: 40px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* Slice slider accent */
.slice-control :deep(.el-slider__runway) { background: rgba(255, 255, 255, 0.18); }
.slice-control :deep(.el-slider__bar) { background: var(--c-accent); }
.slice-control :deep(.el-slider__button) {
  border-color: var(--c-accent);
  background: #fff;
}

/* Responsive */
@media (max-width: 960px) {
  .viewer-main {
    flex-direction: column;
    overflow: auto;
  }
  .grid {
    grid-template-columns: 1fr;
    grid-template-rows: minmax(320px, 1fr) auto;
    height: auto;
  }
  .side-stack {
    display: grid;
    grid-template-columns: repeat(4, minmax(120px, 1fr));
    overflow-x: auto;
    height: auto;
  }
}
</style>

<template>
  <div class="atlas-viewer">
    <!-- Loading state -->
    <div v-if="!visorStore.currentSpecimen" class="loading-state">
      <div class="welcome-card">
        <div class="welcome-content">
          <h2>Loading Specimen…</h2>
          <p>Preparing the atlas viewer for {{ specimenId }}</p>
          <button class="ghost-btn" @click="goHome">Back to Home</button>
        </div>
      </div>
    </div>

    <div v-else class="viewer-content">
      <!-- Status bar -->
      <div class="status-bar">
        <div class="status-left">
          <el-popover
            :width="320"
            placement="bottom-start"
            trigger="click"
            popper-class="metadata-popper"
          >
            <template #reference>
              <button type="button" class="specimen-name" aria-label="Specimen metadata">
                <span>{{ visorStore.currentSpecimen.name }}</span>
                <span class="chevron" aria-hidden="true">▾</span>
              </button>
            </template>
            <MetadataPopover :volume-info="setupCtx?.volumeInfo ?? null" />
          </el-popover>
        </div>

        <div class="status-right">
          <span class="readout">
            <span class="readout-label">Pos</span>
            <span class="readout-value">{{ positionReadout }}</span>
          </span>
          <span class="readout">
            <span class="readout-label">Resolution</span>
            <span class="readout-value">{{ resolutionReadout }}</span>
          </span>
        </div>
      </div>

      <!-- Main viewer area -->
      <div class="viewer-main">
        <!-- View Grid -->
        <div class="viewer-container">
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

        <!-- Inspector panel (right) -->
        <Inspector
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
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useVISoRStore } from '@/stores/visor'
import type { Galavi, State } from 'galavi'
import { cameraDistance, pickPyramidLevel } from 'galavi'
import {
  type ConfiguredViewName,
  type SetupContext,
  isConfiguredViewName,
  bootstrap,
  buildSetupContext,
  getViewLevelRange,
  SLICE_DEFS,
} from '@/galavi-setup'
import { useLayout } from '@/composables/useLayout'
import { useSliceState } from '@/composables/useSliceState'
import Inspector from '@/components/controls/Inspector.vue'
import MetadataPopover from '@/components/controls/MetadataPopover.vue'

interface Props { specimenId: string }
const props = defineProps<Props>()
const router = useRouter()
const visorStore = useVISoRStore()

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
  liveState.activeView = galavi.value?.getActiveView()
}

function syncLiveFromGalavi() {
  if (!galavi.value) return
  updateLive(galavi.value.getState())
}

function getViewLabel(viewName: string) {
  return galavi.value?.getViewConfig(viewName)?.label ?? viewName
}

// ============================================================================
// READOUTS
// ============================================================================

const SLICE_KEYS = new Set(SLICE_DEFS.map(d => d.key))
const SLICE_AXIS_MAP = new Map(SLICE_DEFS.map(d => [d.key, d.axisMap]))

const effectiveLodLevel = computed(() => {
  if (liveState.lodMode === 'manual') return liveState.lodLevel
  const active = liveState.activeView
  if (!active) return liveState.lodLevel
  const sz = liveState.sceneSize
  const isSlice = SLICE_KEYS.has(active)
  const sceneExtent = isSlice
    ? (() => {
        const am = SLICE_AXIS_MAP.get(active)!
        return Math.max(sz[am[0]], sz[am[1]], 1e-6)
      })()
    : Math.max(sz[0], sz[1], sz[2], 1e-6)
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
// NAVIGATION
// ============================================================================

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

onMounted(async () => {
  if (!visorStore.currentSpecimen || visorStore.currentSpecimen.id !== props.specimenId) {
    visorStore.setCurrentSpecimen(props.specimenId)
  }
  if (!visorStore.currentSpecimen) return

  const ctx = await buildSetupContext(visorStore.currentSpecimen)
  setSetupContext(ctx)
  setupCtx.value = ctx

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

  // Subscribe live readouts.
  stopSubscribe = galavi.value.subscribe((s) => updateLive(s))
  syncLiveFromGalavi()
  startLiveLoop()

  requestAnimationFrame(() => {
    galavi.value?.setLodMode('auto')
  })
})

onUnmounted(() => {
  stopSubscribe?.()
  if (liveFrame) window.cancelAnimationFrame(liveFrame)
  galavi.value?.destroy()
})
</script>

<style scoped>
.atlas-viewer {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--c-bg);
  color: var(--c-text);
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

/* Status bar */
.status-bar {
  height: 40px;
  flex-shrink: 0;
  background: var(--c-bg);
  border-bottom: 1px solid var(--c-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 12px;
  color: var(--c-text);
  gap: 14px;
  z-index: 1001;
}

.status-left { display: flex; gap: 12px; align-items: center; }

.specimen-name {
  appearance: none;
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-text-strong);
  font-size: 12px;
  padding: 4px 10px;
  border-radius: var(--radius-md);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font: inherit;
  font-weight: 600;
}

.specimen-name:hover {
  background: var(--c-accent-soft);
  border-color: var(--c-border);
}

.specimen-name .chevron {
  font-size: 10px;
  color: var(--c-text-muted);
  line-height: 1;
}

.status-right {
  display: flex;
  gap: 18px;
  align-items: center;
  font-family: var(--font-mono);
}

.readout { display: inline-flex; gap: 6px; align-items: baseline; }

.readout-label {
  color: var(--c-text-muted);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.readout-value {
  color: var(--c-text);
  font-variant-numeric: tabular-nums;
}

.readout-value.accent { color: var(--c-accent); }

/* Main layout */
.viewer-main {
  flex: 1;
  min-height: 0;
  display: flex;
  position: relative;
  overflow: hidden;
}

.viewer-container {
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
  .status-right { gap: 10px; }
}
</style>

<style>
/* Themed popper for the metadata popover (must be unscoped to reach el-popover content). */
.metadata-popper.el-popover.el-popper {
  background: var(--c-bg-elev);
  border: 1px solid var(--c-border-strong);
  color: var(--c-text);
  box-shadow: var(--shadow-lg);
}
.metadata-popper.el-popover.el-popper .el-popper__arrow::before {
  background: var(--c-bg-elev);
  border-color: var(--c-border-strong);
}
</style>

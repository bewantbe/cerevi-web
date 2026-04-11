<template>
  <div class="atlas-viewer">
    <!-- Loading state -->
    <div v-if="!visorStore.currentSpecimen" class="loading-state">
      <el-card class="welcome-card">
        <div class="welcome-content">
          <el-icon class="welcome-icon" size="48"><View /></el-icon>
          <h2>Loading Specimen...</h2>
          <p>Preparing the atlas viewer for {{ specimenId }}</p>
          <el-button @click="goHome">Back to Home</el-button>
        </div>
      </el-card>
    </div>

    <div v-else class="viewer-content">
      <!-- Status bar -->
      <div class="status-bar">
        <div class="status-left">
          <span class="specimen-name">{{ visorStore.currentSpecimen.name }}</span>
        </div>
        <div class="status-right">
          <span class="view-label">{{ activeViewLabel }}</span>
        </div>
      </div>

      <!-- Main viewer area with control panel -->
      <div class="viewer-main">
        <!-- Control Panel -->
        <ControlPanel
          :get-galavi="getGalavi"
          :setup-ctx="setupCtx!"
          :channels="channels"
          :channel="channel"
          :contrast-min="contrastMin"
          :contrast-max="contrastMax"
          :contrast-bounds="contrastBounds"
          :contrast-step="contrastStep"
          :slices="slices"
          @channel-change="onPanelChannelChange"
          @contrast-change="onPanelContrastChange"
        />

        <!-- View Grid -->
        <div class="viewer-container">
          <div class="grid">
            <!-- Main view -->
            <div class="main-cell" @click="handleViewClick(layout.main)">
              <canvas ref="canvasMain" class="main-canvas"></canvas>
              <div class="view-label-overlay" :class="{ active: galavi?.getActiveView() === layout.main }">
                {{ galavi?.getViewConfig(layout.main)?.label ?? layout.main }}
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
                <div class="view-label-overlay" :class="{ active: galavi?.getActiveView() === viewName }">
                  {{ galavi?.getViewConfig(viewName)?.label ?? viewName }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { View } from '@element-plus/icons-vue'
import { useVISoRStore } from '@/stores/visor'
import type { Galavi } from 'galavi'
import {
  type ConfiguredViewName,
  type SetupContext,
  isConfiguredViewName,
  bootstrap,
  buildSetupContext,
} from '@/galavi-setup'
import { useLayout } from '@/composables/useLayout'
import { useSliceState } from '@/composables/useSliceState'
import ControlPanel from '@/components/controls/ControlPanel.vue'

// Props
interface Props {
  specimenId: string
}
const props = defineProps<Props>()
const router = useRouter()
const visorStore = useVISoRStore()

// ============================================================================
// GALAVI INSTANCE
// ============================================================================

let galavi = ref<Galavi | undefined>()
const getGalavi = () => galavi.value
const setupCtx = ref<SetupContext>()

// ============================================================================
// CANVAS REFS
// ============================================================================

const canvasMain = ref<HTMLCanvasElement | null>(null)
const canvasRefs = reactive<Record<string, HTMLCanvasElement | null>>({})
function setCanvasRef(name: string, el: HTMLCanvasElement | null) {
  canvasRefs[name] = el
}

// ============================================================================
// COMPOSABLES (initialized with placeholder, re-initialized on mount)
// ============================================================================

const { layout, swapToMain, handleViewClick } = useLayout(
  getGalavi,
  () => canvasMain.value,
  canvasRefs,
)

// Slice state — needs setupCtx. We use a default until specimen loads.
const defaultCtx: SetupContext = {
  srcPrefix: '', shapesPrefix: '', dataSize: [1, 1, 1], surfaceSize: [1, 1, 1],
  scale: 1, conRange: [0, 0.05], mip: 20, initCh: 0, initRegion: 'brain_shell',
  channelCount: 4, volumeLevelRange: [0, 9], volumeTileSize: [64, 64, 64],
}

const {
  channels, channel, contrastBounds, contrastStep,
  contrastMin, contrastMax, slices,
  setSetupContext, setSliceValue,
  onChannelChange, onContrastChange, onSliceChange,
} = useSliceState(getGalavi, defaultCtx)

// ============================================================================
// COMPUTED
// ============================================================================

const activeViewLabel = computed(() => {
  if (!galavi.value) return ''
  const active = galavi.value.getActiveView()
  if (!active) return ''
  return galavi.value.getViewConfig(active)?.label ?? active
})

// ============================================================================
// PANEL EVENT HANDLERS
// ============================================================================

function onPanelChannelChange(ch: number) {
  channel.value = ch
  onChannelChange()
}

function onPanelContrastChange(range: [number, number]) {
  contrastMin.value = range[0]
  contrastMax.value = range[1]
  onContrastChange()
}

function setSliceFromSlider(viewName: string, value: number | number[]) {
  const normalized = Array.isArray(value) ? value[0] : value
  setSliceValue(viewName, normalized)
}

// ============================================================================
// NAVIGATION
// ============================================================================

function goHome() {
  router.push('/')
}

// ============================================================================
// LIFECYCLE
// ============================================================================

onMounted(async () => {
  // Load specimen if not already loaded
  if (!visorStore.currentSpecimen || visorStore.currentSpecimen.id !== props.specimenId) {
    await visorStore.setCurrentSpecimen(props.specimenId)
  }

  if (!visorStore.currentSpecimen) return

  // Build setup context from specimen metadata
  const ctx = buildSetupContext(visorStore.currentSpecimen)
  setupCtx.value = ctx
  setSetupContext(ctx)

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
  galavi.value.view('volume').forward({
    type: 'resolution:setLevel',
    payload: { level: ctx.volumeLevelRange[1] },
  })
  requestAnimationFrame(() => {
    galavi.value?.view('volume').forward({
      type: 'resolution:setMode',
      payload: { mode: 'auto' },
    })
  })
})

onUnmounted(() => {
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
}

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
}

.welcome-content {
  padding: 40px 20px;
}

.welcome-icon {
  color: #409eff;
  margin-bottom: 20px;
}

.welcome-content h2 {
  color: #303133;
  margin-bottom: 16px;
}

.welcome-content p {
  color: #606266;
  line-height: 1.6;
  margin-bottom: 20px;
}

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
  background: #1a1a2e;
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  font-size: 12px;
  color: #ccc;
  z-index: 1001;
}

.status-left {
  display: flex;
  gap: 12px;
  align-items: center;
}

.specimen-name {
  font-weight: 600;
  color: #e0e0e0;
}

.status-right {
  display: flex;
  gap: 12px;
  align-items: center;
}

.view-label {
  color: #67c23a;
  font-family: monospace;
}

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
  background: #111;
}

/* Grid layout — main + side stack */
.grid {
  flex: 1;
  height: 100%;
  display: grid;
  grid-template-columns: 4fr 1fr;
  gap: 4px;
  padding: 4px;
  min-height: 0;
}

.main-cell {
  position: relative;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  min-width: 0;
  min-height: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.main-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.side-stack {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  min-height: 0;
  height: 100%;
}

.side-cell {
  position: relative;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
  min-height: 0;
  cursor: pointer;
  flex: 1 1 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.side-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

/* View label overlay */
.view-label-overlay {
  position: absolute;
  bottom: 4px;
  left: 4px;
  font-size: 10px;
  font-family: monospace;
  color: #888;
  background: rgba(0, 0, 0, 0.6);
  padding: 2px 6px;
  border-radius: 3px;
  pointer-events: none;
}

.view-label-overlay.active {
  color: #4af;
  border-left: 2px solid #4af;
}

/* Slice control overlay */
.slice-control {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
  padding: 24px 16px 12px;
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 10;
}

.slice-control label {
  color: #aaa;
  font-size: 11px;
  font-family: monospace;
  white-space: nowrap;
}

.slice-slider {
  flex: 1;
}

.slice-value {
  color: #fff;
  font-size: 11px;
  font-family: monospace;
  min-width: 40px;
  text-align: right;
}

/* Responsive */
@media (max-width: 768px) {
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

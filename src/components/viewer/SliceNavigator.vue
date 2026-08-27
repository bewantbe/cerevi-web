<template>
  <div class="slice-navigator">
    <canvas ref="canvasEl" class="nav-canvas"></canvas>
    <div class="nav-line" :class="{ horizontal: horizontalIndicator }" :style="lineStyle"></div>
    <div v-if="buildError" class="nav-error">{{ buildError }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { DEFAULT_FOV, physicalToVolumeScreen, type BaseLayer, type ViewerRuntime } from 'galavi'
import { useCereviStore } from '@/stores/visor'
import { describeBuildError, useGalaviSession } from '@/composables/useGalaviSession'
import { buildNavigatorOverview, NAVIGATOR_DISTANCE_FACTOR } from '@/galavi/standalone-builders'
import { physicalFraming, sliceDef, type SlicePlane } from '@/galavi/slice-geometry'

const props = withDefaults(defineProps<{
  plane: SlicePlane
  slice: number
  max: number
  open?: boolean
}>(), {
  open: false,
})
const store = useCereviStore()

const activeChannel = computed<number | null>(() =>
  store.galleryChannels.find((channel) => channel.visible)?.index ?? null,
)

const activeChannelColor = computed<string | undefined>(() =>
  store.galleryChannels.find((channel) => channel.visible)?.color,
)

const canvasEl = ref<HTMLCanvasElement | null>(null)
const linePct = computed(() => (props.max > 0 ? (props.slice / props.max) * 100 : 0))
const horizontalIndicator = computed(() => props.plane === 'xz')
const canvasWidth = ref(0)
const canvasHeight = ref(0)
const PERSPECTIVE_HALF_FOV_TAN = Math.tan(DEFAULT_FOV / 2)
const projectedBounds = ref<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

const lineStyle = computed(() => {
  const ctx = store.setupCtx
  const w = canvasWidth.value
  const h = canvasHeight.value
  if (!ctx || w <= 0 || h <= 0 || !ctx.meshResource()) {
    return horizontalIndicator.value
      ? { top: `calc(${linePct.value}% - 1px)` }
      : { left: `calc(${linePct.value}% - 1px)` }
  }
  const frac = props.max > 0 ? props.slice / props.max : 0.5
  if (projectedBounds.value) {
    if (horizontalIndicator.value) {
      const topPx = projectedBounds.value.minY + frac * (projectedBounds.value.maxY - projectedBounds.value.minY) - 1
      return { top: `${clamp(topPx, -1, h - 1)}px` }
    }
    const leftPx = projectedBounds.value.minX + frac * (projectedBounds.value.maxX - projectedBounds.value.minX) - 1
    return { left: `${clamp(leftPx, -1, w - 1)}px` }
  }
  const sliceAxis = sliceDef(ctx, props.plane).axisMap[2]
  const { size, maxExtent } = physicalFraming(ctx)
  const distance = maxExtent * NAVIGATOR_DISTANCE_FACTOR
  const delta = (frac - 0.5) * size[sliceAxis]
  if (horizontalIndicator.value) {
    const visibleHalfHeight = Math.max(distance * PERSPECTIVE_HALF_FOV_TAN, 1e-6)
    const clipY = delta / visibleHalfHeight
    const topPx = (clipY * 0.5 + 0.5) * h - 1
    return { top: `${clamp(topPx, -1, h - 1)}px` }
  }
  const aspect = w / h
  const visibleHalfWidth = Math.max(distance * PERSPECTIVE_HALF_FOV_TAN * aspect, 1e-6)
  const clipX = delta / visibleHalfWidth
  const leftPx = (clipX * 0.5 + 0.5) * w - 1
  return { left: `${clamp(leftPx, -1, w - 1)}px` }
})

let instance: ViewerRuntime | undefined
const buildError = ref<string | null>(null)
const session = useGalaviSession()
let readyAbort: AbortController | undefined

function surfaceLayer(): BaseLayer | undefined {
  if (!instance) return undefined
  try {
    return instance.view('main').getLayer('surface')
  } catch {
    return undefined
  }
}

function cancelReadyWait() {
  readyAbort?.abort()
  readyAbort = undefined
}

// Wait for the surface mesh to finish loading via galavi's readiness
// notification, then recompute the projected bounds.
function waitForSurfaceReady() {
  cancelReadyWait()
  const runtime = instance
  if (!runtime) return
  readyAbort = new AbortController()
  const { signal } = readyAbort
  runtime
    .view('main')
    .whenLayerReady('surface', { signal })
    .then(() => {
      if (signal.aborted || runtime !== instance) return
      refreshProjectedBounds()
    })
    .catch(() => {
      // Aborted on rebuild/unmount, the surface failed to load, or the
      // layer/view went away — projected bounds stay unset (fallback line).
    })
}

function projectScreen(point: [number, number, number]): [number, number] | null {
  if (!instance || canvasWidth.value <= 0 || canvasHeight.value <= 0) return null
  return physicalToVolumeScreen(point, instance.camera, canvasWidth.value, canvasHeight.value)
}

function refreshProjectedBounds() {
  const ctx = store.setupCtx
  const mesh = ctx?.meshResource()
  if (!instance || !ctx || !mesh || mesh.downsampleFactor === undefined) {
    projectedBounds.value = null
    return
  }
  const layer = surfaceLayer()
  if (!layer?.isReady) {
    projectedBounds.value = null
    waitForSurfaceReady()
    return
  }
  const aabb = layer.getWorldAABB()
  if (!aabb) {
    projectedBounds.value = null
    return
  }
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (const x of [aabb.min[0], aabb.max[0]]) {
    for (const y of [aabb.min[1], aabb.max[1]]) {
      for (const z of [aabb.min[2], aabb.max[2]]) {
        const projected = projectScreen([x, y, z])
        if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) continue
        const [projectedX, projectedY] = projected
        if (projectedX < minX) minX = projectedX
        if (projectedX > maxX) maxX = projectedX
        if (projectedY < minY) minY = projectedY
        if (projectedY > maxY) maxY = projectedY
      }
    }
  }
  if (
    !Number.isFinite(minX) || !Number.isFinite(maxX) || maxX - minX < 1 ||
    !Number.isFinite(minY) || !Number.isFinite(maxY) || maxY - minY < 1
  ) {
    projectedBounds.value = null
    return
  }
  projectedBounds.value = { minX, maxX, minY, maxY }
}

function updateCanvasSize() {
  canvasWidth.value = canvasEl.value?.clientWidth ?? 0
  canvasHeight.value = canvasEl.value?.clientHeight ?? 0
}

async function rebuild() {
  const ctx = store.setupCtx
  if (!ctx || !canvasEl.value || !props.open) return
  const token = session.nextBuildToken()
  projectedBounds.value = null
  cancelReadyWait()
  await nextTick()
  if (!session.isBuildCurrent(token) || !canvasEl.value) return
  let next: ViewerRuntime
  try {
    // Build and GPU-init the replacement off-canvas first: mounting
    // reconfigures the canvas's WebGPU context, which the live runtime still
    // owns — a failed build must leave it running.
    next = await buildNavigatorOverview({
      ctx,
      plane: props.plane,
      channel: activeChannel.value,
      color: activeChannelColor.value,
      cameraMode: 'slice-view',
    })
  } catch (err) {
    if (session.isBuildCurrent(token)) {
      console.error('[navigator] overview build failed:', err)
      // The live runtime keeps running; only surface the failure when there
      // is nothing left to show.
      if (!instance) buildError.value = describeBuildError(err)
    }
    return
  }
  if (!session.isBuildCurrent(token) || !canvasEl.value) {
    // Superseded while building — destroy the never-mounted result.
    next.destroy()
    return
  }
  instance?.destroy()
  instance = next
  buildError.value = null
  try {
    await next.mount('main', canvasEl.value)
  } catch (err) {
    next.destroy()
    if (instance === next) instance = undefined
    if (session.isBuildCurrent(token)) {
      console.error('[navigator] overview mount failed:', err)
      buildError.value = describeBuildError(err)
    }
    return
  }
  refreshProjectedBounds()
}

onMounted(() => {
  updateCanvasSize()
  if (props.open && store.setupCtx) void rebuild()
  session.observeResizes([canvasEl.value], () => {
    updateCanvasSize()
    if (props.open && store.setupCtx && canvasEl.value?.clientWidth && canvasEl.value?.clientHeight) {
      void rebuild()
    } else {
      refreshProjectedBounds()
    }
  })
})

onBeforeUnmount(() => {
  cancelReadyWait()
  session.teardownSession(instance)
})

watch(
  () => [store.setupCtx, props.plane, props.open, activeChannel.value, activeChannelColor.value],
  () => {
    updateCanvasSize()
    if (props.open && store.setupCtx) void rebuild()
  },
)

watch(
  () => [props.slice, props.max],
  () => {
    if (projectedBounds.value === null) refreshProjectedBounds()
  },
)
</script>

<style scoped>
.slice-navigator {
  position: relative;
  width: 100%;
  flex: 1 1 0;
  min-height: 0;
  border: 1px solid var(--galavi-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #000;
}

.nav-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.nav-line {
  position: absolute;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: linear-gradient(180deg, transparent, var(--galavi-accent), transparent);
  box-shadow: 0 0 10px var(--galavi-accent-soft);
  pointer-events: none;
}

.nav-line.horizontal {
  right: 8px;
  left: 8px;
  bottom: auto;
  width: auto;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--galavi-accent), transparent);
}

.nav-error {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 8px;
  overflow: hidden;
  color: var(--galavi-warn);
  background: var(--app-bg);
  font: 11px var(--galavi-font-mono);
  text-align: center;
}
</style>

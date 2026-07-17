<template>
  <div class="slice-navigator">
    <canvas ref="canvasEl" class="nav-canvas"></canvas>
    <div class="nav-line" :class="{ horizontal: horizontalIndicator }" :style="lineStyle"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Galavi } from 'galavi'
import { useVISoRStore } from '@/stores/visor'
import { buildNavigatorOverview, NAVIGATOR_DISTANCE_FACTOR } from '@/galavi/gallery'
import { physicalFraming, sliceDef } from '@/galavi-setup'
import type { SlicePlane } from '@/galavi-setup'
import { physicalToVolumeScreen } from '@/utils/viewCoordinates'

const props = withDefaults(defineProps<{ plane: SlicePlane; slice: number; max: number; open?: boolean }>(), {
  open: false,
})
const store = useVISoRStore()

const activeChannel = computed<number | null>(() =>
  store.galleryChannels.find((channel) => channel.visible)?.index ?? null,
)

const canvasEl = ref<HTMLCanvasElement | null>(null)
const linePct = computed(() => (props.max > 0 ? (props.slice / props.max) * 100 : 0))
const horizontalIndicator = computed(() => props.plane === 'xz')
const canvasWidth = ref(0)
const canvasHeight = ref(0)
const PERSPECTIVE_HALF_FOV_TAN = Math.tan(Math.PI / 8)
const projectedBounds = ref<{ minX: number; maxX: number; minY: number; maxY: number } | null>(null)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

const lineStyle = computed(() => {
  const ctx = store.setupCtx
  const w = canvasWidth.value
  const h = canvasHeight.value
  if (!ctx || w <= 0 || h <= 0 || !ctx.hasMesh) {
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

let instance: Galavi | undefined
let token = 0
let resizeObserver: ResizeObserver | undefined
let boundsFrame: number | undefined

function transformPoint(matrix: ArrayLike<number>, point: [number, number, number]): [number, number, number] {
  const [x, y, z] = point
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15]
  const invW = Math.abs(w) > 1e-6 ? 1 / w : 1
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * invW,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * invW,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * invW,
  ]
}

function cancelBoundsRefresh() {
  if (boundsFrame !== undefined) cancelAnimationFrame(boundsFrame)
  boundsFrame = undefined
}

function projectScreen(point: [number, number, number]): [number, number] | null {
  if (!instance || canvasWidth.value <= 0 || canvasHeight.value <= 0) return null
  return physicalToVolumeScreen(point, instance.camera, canvasWidth.value, canvasHeight.value)
}

function refreshProjectedBounds(attempt = 0) {
  cancelBoundsRefresh()
  const ctx = store.setupCtx
  if (!instance || !ctx || !ctx.hasMesh || ctx.meshDownsampleFactor === null) {
    projectedBounds.value = null
    return
  }
  const entry = (instance as any)?._views?.get?.('main')?.layers?.get?.('surface')
  const positions = typeof entry?.getPositions === 'function' ? entry.getPositions() : null
  const matrix = entry?.modelMatrix as ArrayLike<number> | undefined
  if (!positions || positions.length < 3 || !matrix) {
    projectedBounds.value = null
    if (attempt < 120) boundsFrame = requestAnimationFrame(() => refreshProjectedBounds(attempt + 1))
    return
  }
  const pointCount = Math.floor(positions.length / 3)
  const sampleStep = Math.max(1, Math.ceil(pointCount / 6000))
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let vertexIndex = 0; vertexIndex < pointCount; vertexIndex += sampleStep) {
    const offset = vertexIndex * 3
    const world = transformPoint(matrix, [positions[offset], positions[offset + 1], positions[offset + 2]])
    const projected = projectScreen(world)
    if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) continue
    const [projectedX, projectedY] = projected
    if (projectedX < minX) minX = projectedX
    if (projectedX > maxX) maxX = projectedX
    if (projectedY < minY) minY = projectedY
    if (projectedY > maxY) maxY = projectedY
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
  const myToken = ++token
  projectedBounds.value = null
  instance?.destroy()
  instance = undefined
  await nextTick()
  if (myToken !== token || !canvasEl.value) return
  instance = await buildNavigatorOverview({
    ctx,
    plane: props.plane,
    canvas: canvasEl.value,
    channel: activeChannel.value,
    cameraMode: 'slice-view',
  })
  if (myToken !== token) {
    instance.destroy()
    instance = undefined
    return
  }
  refreshProjectedBounds()
}

onMounted(() => {
  updateCanvasSize()
  if (props.open && store.setupCtx) void rebuild()
  resizeObserver = new ResizeObserver(() => {
    updateCanvasSize()
    if (props.open && store.setupCtx && canvasEl.value?.clientWidth && canvasEl.value?.clientHeight) {
      void rebuild()
    } else {
      refreshProjectedBounds()
    }
  })
  if (canvasEl.value) resizeObserver.observe(canvasEl.value)
})

onBeforeUnmount(() => {
  token++
  cancelBoundsRefresh()
  resizeObserver?.disconnect()
  instance?.destroy()
  instance = undefined
})

watch(
  () => [store.setupCtx, props.plane, props.open, activeChannel.value],
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
  border: 1px solid var(--c-border);
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
  background: linear-gradient(180deg, rgba(110, 168, 255, 0.2), var(--c-accent), rgba(110, 168, 255, 0.2));
  box-shadow: 0 0 10px var(--c-accent-strong);
  pointer-events: none;
}

.nav-line.horizontal {
  right: 8px;
  left: 8px;
  bottom: auto;
  width: auto;
  height: 2px;
  background: linear-gradient(90deg, rgba(110, 168, 255, 0.2), var(--c-accent), rgba(110, 168, 255, 0.2));
}
</style>

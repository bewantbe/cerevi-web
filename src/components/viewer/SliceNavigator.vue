<template>
  <div class="slice-navigator">
    <canvas ref="canvasEl" class="nav-canvas"></canvas>
    <div class="nav-line" :style="lineStyle"></div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Galavi } from 'galavi'
import { useVISoRStore } from '@/stores/visor'
import { buildNavigatorOverview, NAVIGATOR_DISTANCE_FACTOR } from '@/galavi/gallery'
import { physicalFraming, sliceDef } from '@/galavi-setup'
import type { SlicePlane } from '@/galavi-setup'

const props = withDefaults(defineProps<{ plane: SlicePlane; slice: number; max: number; open?: boolean }>(), {
  open: false,
})
const store = useVISoRStore()

const activeChannel = computed<number | null>(() =>
  store.galleryChannels.find((channel) => channel.visible)?.index ?? null,
)

const canvasEl = ref<HTMLCanvasElement | null>(null)
const linePct = computed(() => (props.max > 0 ? (props.slice / props.max) * 100 : 0))
const canvasWidth = ref(0)
const canvasHeight = ref(0)
const PERSPECTIVE_HALF_FOV_TAN = Math.tan(Math.PI / 8)
const projectedBounds = ref<{ minX: number; maxX: number } | null>(null)

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

const lineStyle = computed(() => {
  const ctx = store.setupCtx
  const w = canvasWidth.value
  const h = canvasHeight.value
  if (!ctx || w <= 0 || h <= 0 || !ctx.hasMesh) {
    return { left: `calc(${linePct.value}% - 1px)` }
  }
  const frac = props.max > 0 ? props.slice / props.max : 0.5
  if (projectedBounds.value) {
    const leftPx = projectedBounds.value.minX + frac * (projectedBounds.value.maxX - projectedBounds.value.minX) - 1
    return { left: `${clamp(leftPx, -1, w - 1)}px` }
  }
  const sliceAxis = sliceDef(props.plane).axisMap[2]
  const { size, maxExtent } = physicalFraming(ctx)
  const distance = maxExtent * NAVIGATOR_DISTANCE_FACTOR
  const aspect = w / h
  const delta = (frac - 0.5) * size[sliceAxis]
  const visibleHalfWidth = Math.max(distance * PERSPECTIVE_HALF_FOV_TAN * aspect, 1e-6)
  const clipX = delta / visibleHalfWidth
  const leftPx = (clipX * 0.5 + 0.5) * w - 1
  return { left: `${clamp(leftPx, -1, w - 1)}px` }
})

let instance: Galavi | undefined
let token = 0
let resizeObserver: ResizeObserver | undefined
let boundsFrame: number | undefined

function dot(a: [number, number, number], b: [number, number, number]) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}

function cross(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ]
}

function normalize(v: [number, number, number]): [number, number, number] {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

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

function projectScreenX(point: [number, number, number]): number | null {
  if (!instance || canvasWidth.value <= 0 || canvasHeight.value <= 0) return null
  const cam = instance.camera
  const up = (cam.up ?? [0, 1, 0]) as [number, number, number]
  const forward = normalize([
    cam.target[0] - cam.position[0],
    cam.target[1] - cam.position[1],
    cam.target[2] - cam.position[2],
  ])
  const right = normalize(cross(forward, up))
  const rel: [number, number, number] = [
    point[0] - cam.position[0],
    point[1] - cam.position[1],
    point[2] - cam.position[2],
  ]
  const depth = dot(rel, forward)
  if (depth <= 1e-6) return null
  const aspect = canvasWidth.value / canvasHeight.value
  const visibleHalfWidth = Math.max(depth * PERSPECTIVE_HALF_FOV_TAN * aspect, 1e-6)
  const clipX = dot(rel, right) / visibleHalfWidth
  return (clipX * 0.5 + 0.5) * canvasWidth.value
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
  for (let vertexIndex = 0; vertexIndex < pointCount; vertexIndex += sampleStep) {
    const offset = vertexIndex * 3
    const world = transformPoint(matrix, [positions[offset], positions[offset + 1], positions[offset + 2]])
    const projected = projectScreenX(world)
    if (projected === null || !Number.isFinite(projected)) continue
    if (projected < minX) minX = projected
    if (projected > maxX) maxX = projected
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX) || maxX - minX < 1) {
    projectedBounds.value = null
    return
  }
  projectedBounds.value = { minX, maxX }
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
</style>

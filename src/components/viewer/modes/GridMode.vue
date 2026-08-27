<template>
  <div class="grid-mode">
    <div ref="viewport" class="grid-viewport" @wheel.prevent="onWheel">
      <div class="grid-page" :style="{ width: `${pageWidth}px`, height: `${pageHeight}px` }">
        <div
          v-for="cell in cells"
          v-show="cell.visible"
          :key="cell.poolIndex"
          class="grid-cell"
          :style="{
            width: `${cellSize}px`,
            height: `${cellSize}px`,
            transform: `translate(${cell.left}px, ${cell.top}px)`,
          }"
        >
          <canvas
            :ref="(element) => setCanvas(cell.poolIndex, element as HTMLCanvasElement | null)"
            :style="{ width: `${cellSize}px`, height: `${cellSize}px` }"
          ></canvas>
          <span class="slice-badge">{{ cell.sliceIndex }}</span>
          <div class="cell-action">
            <button type="button" @click="openInSlice(cell.sliceIndex)">Open slice</button>
          </div>
        </div>
      </div>
    </div>

    <nav v-if="pageStops.length" class="page-strip" aria-label="Slice pages">
      <div class="page-rail">
        <button
          v-for="page in pageStops"
          :key="page.index"
          :ref="(element) => setStopElement(page.index, element as HTMLButtonElement | null)"
          type="button"
          class="page-stop"
          :class="{ active: page.index === currentPage }"
          @click="goToPage(page.index)"
        >
          {{ page.label }}
        </button>
      </div>
    </nav>

    <div v-if="buildError" class="mode-error">{{ buildError }}</div>
  </div>
</template>

<script setup lang="ts">
import {
  createSliceGrid,
  type SliceGrid,
} from '@/galavi/slice-grid'
import type { DatasetChannel, ImagePyramidResource, Vec2 } from 'galavi'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import {
  channelColor,
  fitSliceCamera,
  physicalFraming,
  sliceCount,
  sliceData,
  sliceDef,
  storageSliceIndex,
  type SlicePlane,
} from '@/galavi/slice-geometry'
import type { CereviDataset } from '@/galavi/specimen-dataset'
import { useCereviStore } from '@/stores/visor'
import { getGalaviTheme } from '@/composables/useTheme'
import { describeBuildError } from '@/composables/useGalaviSession'

// ============================================================================
// GRID COMPOSITION (app-owned createSliceGrid — @/galavi/slice-grid)
// The controller owns the runtime, internal layer/view IDs, and the batched
// slice/channel patching; this component keeps the Vue-owned cells/canvases,
// responsive pool sizing, page strip, current-plane policy, channel
// selection, and route state.
// ============================================================================

/**
 * The current plane as a slice-grid source: the named precomputed-plane
 * image resource of the specimen dataset (`"plane-xy"`/`"plane-xz"`/
 * `"plane-yz"`, selected by the view's storage source plane).
 */
function planeResource(ctx: CereviDataset, plane: SlicePlane): ImagePyramidResource {
  return ctx.planeResource(sliceDef(ctx, plane).sourcePlane)
}

// ============================================================================
// COMPONENT
// ============================================================================

const props = defineProps<{ ctx: CereviDataset }>()
const store = useCereviStore()
const GAP = 10
const TOP_PADDING = 12
// Bottom space kept clear of the absolutely docked page strip (~50px tall).
const SLIDER_RESERVE = 56
const MIN_CELL = 140
const PAGE_TURN_COOLDOWN_MS = 180

interface GridCell {
  poolIndex: number
  sliceIndex: number
  top: number
  left: number
  visible: boolean
}

interface PageStop {
  index: number
  label: string
}

interface LayoutChoice {
  columns: number
  rows: number
  cell: number
  slots: number
  fill: number
}

const viewport = ref<HTMLElement | null>(null)
const cells = reactive<GridCell[]>([])
const canvasElements: (HTMLCanvasElement | null)[] = []
const stopElements: (HTMLButtonElement | null)[] = []
const cellSize = ref(256)
const pageWidth = ref(0)
const pageHeight = ref(0)
const columns = ref(1)
const rows = ref(1)
const pageSize = ref(1)
const totalPages = ref(1)
const currentPage = ref(0)
const pageStops = ref<PageStop[]>([])
const buildError = ref<string | null>(null)
let instance: SliceGrid | null = null
let poolSize = 0
let containerWidth = 0
let containerHeight = 0
let rebuildToken = 0
let lastPageTurnAt = 0
let resizeObserver: ResizeObserver | undefined

function setCanvas(index: number, canvas: HTMLCanvasElement | null) {
  canvasElements[index] = canvas
}

function setStopElement(index: number, element: HTMLButtonElement | null) {
  stopElements[index] = element
}

function measure() {
  containerWidth = viewport.value?.clientWidth ?? 0
  containerHeight = viewport.value?.clientHeight ?? 0
}

function clampPage(index: number): number {
  return Math.max(0, Math.min(totalPages.value - 1, index))
}

function chooseLayout(total: number): LayoutChoice {
  const availableHeight = Math.max(0, containerHeight - TOP_PADDING - SLIDER_RESERVE)
  const maxColumns = Math.max(1, Math.min(total, Math.floor((containerWidth + GAP) / (MIN_CELL + GAP))))
  const maxRows = Math.max(1, Math.min(total, Math.floor((availableHeight + GAP) / (MIN_CELL + GAP))))
  let best: LayoutChoice | null = null

  for (let columnCount = 1; columnCount <= maxColumns; columnCount++) {
    for (let rowCount = 1; rowCount <= maxRows; rowCount++) {
      const widthBound = Math.floor((containerWidth - GAP * (columnCount - 1)) / columnCount)
      const heightBound = Math.floor((availableHeight - GAP * (rowCount - 1)) / rowCount)
      const cell = Math.min(widthBound, heightBound)
      if (cell < MIN_CELL) continue
      const slots = columnCount * rowCount
      const fill = (columnCount * cell + GAP * (columnCount - 1)) * (rowCount * cell + GAP * (rowCount - 1))
      const candidate = { columns: columnCount, rows: rowCount, cell, slots, fill }
      if (!best || candidate.slots > best.slots || (candidate.slots === best.slots && candidate.fill > best.fill)) best = candidate
    }
  }

  if (best) return best
  const fallback = Math.max(96, Math.min(containerWidth, availableHeight))
  return { columns: 1, rows: 1, cell: fallback, slots: 1, fill: fallback * fallback }
}

function updatePageStops(total: number) {
  pageStops.value = Array.from({ length: totalPages.value }, (_, index) => {
    const start = index * pageSize.value
    const end = Math.min(total - 1, start + pageSize.value - 1)
    return { index, label: `${start}-${end}` }
  })
  stopElements.length = totalPages.value
}

function recomputeLayout(anchorSlice = store.currentSlice): boolean {
  measure()
  if (containerWidth <= 0 || containerHeight <= 0) return false
  const total = sliceCount(props.ctx, store.plane)
  const layout = chooseLayout(total)
  columns.value = layout.columns
  rows.value = layout.rows
  cellSize.value = layout.cell
  pageSize.value = Math.max(1, layout.slots)
  totalPages.value = Math.max(1, Math.ceil(total / pageSize.value))
  currentPage.value = clampPage(Math.floor(anchorSlice / pageSize.value))
  pageWidth.value = columns.value * (cellSize.value + GAP) - GAP
  pageHeight.value = rows.value * (cellSize.value + GAP) - GAP
  updatePageStops(total)

  if (poolSize === pageSize.value) return false
  poolSize = pageSize.value
  cells.splice(0, cells.length)
  for (let index = 0; index < poolSize; index++) {
    cells.push({ poolIndex: index, sliceIndex: 0, top: 0, left: 0, visible: false })
  }
  canvasElements.length = poolSize
  return true
}

/** One STORAGE-space slice per pool slot; `undefined` hides an unused tail slot. */
function pageSlices(): (number | undefined)[] {
  return cells.map((cell) =>
    cell.visible ? storageSliceIndex(props.ctx, store.plane, cell.sliceIndex) : undefined,
  )
}

/** The single grid channel from current store state (index, color, contrast). */
function gridChannel(): DatasetChannel {
  const index = store.channel
  return {
    index,
    label: props.ctx.channels[index]?.label ?? `Channel ${index}`,
    color: channelColor(props.ctx, index),
    contrast: [...store.contrastForPlane(store.plane, index)] as Vec2,
    visible: true,
  }
}

function assignPage(applyToRenderer: boolean) {
  const total = sliceCount(props.ctx, store.plane)
  const start = currentPage.value * pageSize.value
  const step = cellSize.value + GAP
  for (let index = 0; index < poolSize; index++) {
    const row = Math.floor(index / columns.value)
    const column = index % columns.value
    const sliceIndex = start + row * columns.value + column
    const cell = cells[index]
    if (!cell) continue
    if (sliceIndex >= total || row >= rows.value) {
      cell.visible = false
      continue
    }
    cell.visible = true
    cell.sliceIndex = sliceIndex
    cell.top = row * step
    cell.left = column * step
  }
  // One batched transaction for the whole page turn.
  if (applyToRenderer) instance?.setSlices(pageSlices())
}

function syncActiveStop(behavior: ScrollBehavior = 'smooth') {
  stopElements[currentPage.value]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior })
}

function gridCanvases(): HTMLCanvasElement[] {
  return cells.map((_, index) => canvasElements[index] as HTMLCanvasElement)
}

async function rebuild(anchorSlice = store.currentSlice) {
  const token = ++rebuildToken
  recomputeLayout(anchorSlice)
  assignPage(false)
  await nextTick()
  if (token !== rebuildToken || poolSize === 0) return
  let next: SliceGrid
  try {
    // Build and GPU-init the replacement off-canvas before touching the live
    // grid — a failed build leaves the previous grid running.
    const plane = store.plane
    const { size, unit } = physicalFraming(props.ctx)
    const fitted = fitSliceCamera(props.ctx, plane)
    const transform = sliceData(props.ctx, plane).transform
    next = await createSliceGrid({
      source: planeResource(props.ctx, plane),
      axes: sliceDef(props.ctx, plane).axisMap,
      channels: [gridChannel()],
      slices: pageSlices(),
      ...(transform !== undefined ? { transform } : {}),
      physical: { spatial: { size, unit } },
      camera: {
        navMode: 'fly',
        projMode: 'orthographic',
        position: fitted.position,
        target: fitted.target,
      },
      theme: getGalaviTheme(),
    })
  } catch (err) {
    if (token === rebuildToken) {
      console.error('[grid] grid build failed:', err)
      // The live grid keeps running; only surface the failure when there is
      // nothing left to show.
      if (!instance) buildError.value = describeBuildError(err)
    }
    return
  }
  if (token !== rebuildToken) {
    // Superseded while building — destroy the never-mounted result.
    next.destroy()
    return
  }
  // Destroy only now: the old grid owns the canvases' WebGPU contexts until
  // this point, and the replacement must not be mounted over them.
  instance?.destroy()
  instance = next
  buildError.value = null
  try {
    await next.mount(gridCanvases())
  } catch (err) {
    // A failed mount has already destroyed the controller (transactional
    // handoff) — just drop the reference and surface the error.
    if (instance === next) instance = null
    if (token === rebuildToken) {
      console.error('[grid] grid mount failed:', err)
      buildError.value = describeBuildError(err)
    }
    return
  }
  syncActiveStop('auto')
}

function applyChannelState() {
  // Channel selection, color, and contrast land in ONE batched transaction.
  instance?.setChannels([gridChannel()])
}

function goToPage(index: number, syncSlice = true) {
  const next = clampPage(index)
  if (next === currentPage.value) return syncActiveStop()
  currentPage.value = next
  assignPage(true)
  if (syncSlice) store.setSlice(store.plane, next * pageSize.value)
  syncActiveStop()
}

function requestPageTurn(delta: number, throttled = false) {
  if (throttled) {
    const now = performance.now()
    if (now - lastPageTurnAt < PAGE_TURN_COOLDOWN_MS) return
    lastPageTurnAt = now
  }
  goToPage(currentPage.value + delta)
}

function onWheel(event: WheelEvent) {
  const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX
  requestPageTurn(delta > 0 ? 1 : -1, true)
}

function shouldIgnoreKey(event: KeyboardEvent): boolean {
  const target = event.target
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

function onKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || shouldIgnoreKey(event)) return
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    requestPageTurn(event.key === 'ArrowRight' ? 1 : -1, true)
  }
}

function openInSlice(sliceIndex: number) {
  store.setSlice(store.plane, sliceIndex)
  store.setMode('slice')
}

onMounted(() => {
  measure()
  void rebuild()
  window.addEventListener('keydown', onKeydown)
  resizeObserver = new ResizeObserver(() => {
    const anchor = currentPage.value * pageSize.value
    if (recomputeLayout(anchor)) void rebuild(anchor)
    else {
      assignPage(true)
      syncActiveStop('auto')
      instance?.runtime.requestRender()
    }
  })
  if (viewport.value) resizeObserver.observe(viewport.value)
})

onBeforeUnmount(() => {
  rebuildToken += 1
  window.removeEventListener('keydown', onKeydown)
  resizeObserver?.disconnect()
  instance?.destroy()
})

watch(() => store.plane, () => void rebuild(store.currentSlice))
watch(() => store.channel, applyChannelState)
watch(() => [store.contrastMin, store.contrastMax], applyChannelState)
</script>

<style scoped>
.grid-mode { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--app-bg); }
.grid-viewport { position: relative; display: flex; min-height: 0; flex: 1 1 auto; align-items: flex-start; justify-content: center; overflow: hidden; padding-top: 12px; }
.grid-page { position: relative; flex: 0 0 auto; }
.grid-cell { position: absolute; top: 0; left: 0; overflow: hidden; border: 1px solid var(--galavi-border); border-radius: var(--radius-sm); background: #000; will-change: transform; }
.grid-cell canvas { display: block; }
.slice-badge { position: absolute; top: 6px; left: 6px; padding: 2px 7px; border-radius: 2px; background: var(--galavi-panel-bg); color: var(--galavi-text); font: 600 12px var(--galavi-font-mono); font-variant-numeric: tabular-nums; pointer-events: none; }
.cell-action { position: absolute; z-index: 3; right: 0; bottom: 0; left: 0; padding: 18px 12px 12px; background: linear-gradient(transparent, rgba(4, 9, 13, 0.96)); opacity: 0; transform: translateY(100%); transition: opacity 0.18s, transform 0.18s; }
.grid-cell:hover .cell-action { opacity: 1; transform: translateY(0); }
.cell-action button { width: 100%; padding: 8px 10px; border: 1px solid var(--galavi-border); border-radius: var(--radius-sm); background: var(--galavi-panel-bg); color: var(--galavi-text); font: 600 12px var(--galavi-font-mono); cursor: pointer; }
.cell-action button:hover { border-color: var(--galavi-accent); color: var(--galavi-accent); }
.page-strip { position: absolute; z-index: 65; right: 0; bottom: 0; left: 0; display: flex; align-items: stretch; border-top: 1px solid var(--galavi-border); background: var(--app-bg-soft); }
.page-rail { display: flex; gap: 0; flex: 1 1 auto; overflow-x: auto; padding: 10px 18px 12px 16px; }
.page-stop { width: 92px; flex: 0 0 92px; padding: 8px 0 0; border: 0; border-top: 2px solid var(--galavi-border); background: transparent; color: var(--galavi-text-dim); font: 11px var(--galavi-font-mono); font-variant-numeric: tabular-nums; cursor: pointer; }
.page-stop:hover, .page-stop.active { color: var(--galavi-text); }
.page-stop.active { border-top-color: var(--galavi-accent); }
.mode-error { position: absolute; inset: 0; z-index: 70; display: grid; place-items: center; padding: 24px; color: var(--galavi-warn); text-align: center; background: var(--app-bg); }
</style>

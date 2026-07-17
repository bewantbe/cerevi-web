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
  </div>
</template>

<script setup lang="ts">
import type { Galavi } from 'galavi'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { sliceCount, storageSliceIndex, type SetupContext } from '@/galavi-setup'
import { buildGrid, cellLayerId, scaledSliceContrast } from '@/galavi/grid'
import { useVISoRStore } from '@/stores/visor'

const props = defineProps<{ ctx: SetupContext }>()
const store = useVISoRStore()
const GAP = 10
const TOP_PADDING = 12
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
let instance: Galavi | null = null
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
  const availableHeight = Math.max(0, containerHeight - TOP_PADDING)
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
    const changed = !cell.visible || cell.sliceIndex !== sliceIndex
    cell.visible = true
    cell.sliceIndex = sliceIndex
    cell.top = row * step
    cell.left = column * step
    if (applyToRenderer && changed) {
      instance?.layer(cellLayerId(index))?.setOptions({
        sliceIndex: storageSliceIndex(props.ctx, store.plane, sliceIndex),
      })
    }
  }
}

function syncActiveStop(behavior: ScrollBehavior = 'smooth') {
  stopElements[currentPage.value]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior })
}

async function rebuild(anchorSlice = store.currentSlice) {
  const token = ++rebuildToken
  recomputeLayout(anchorSlice)
  assignPage(false)
  await nextTick()
  if (token !== rebuildToken) return
  instance?.destroy()
  instance = await buildGrid({
    ctx: props.ctx,
    plane: store.plane,
    channel: store.channel,
    contrast: [store.contrastMin, store.contrastMax],
    poolSize,
    initialSlices: cells.map((cell) => cell.sliceIndex),
    canvases: canvasElements,
  })
  if (token !== rebuildToken) {
    instance.destroy()
    instance = null
    return
  }
  syncActiveStop('auto')
}

function applyChannel() {
  for (let index = 0; index < poolSize; index++) {
    instance?.layer(cellLayerId(index))?.setOptions({ selection: { c: store.channel } })
  }
}

function applyContrast() {
  const contrast = scaledSliceContrast(props.ctx, store.plane, [store.contrastMin, store.contrastMax])
  for (let index = 0; index < poolSize; index++) {
    instance?.layer(cellLayerId(index))?.setRender({ contrastLimits: contrast })
  }
}

function goToPage(index: number) {
  const next = clampPage(index)
  if (next === currentPage.value) return syncActiveStop()
  currentPage.value = next
  assignPage(true)
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
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], .el-select'))
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
      instance?.requestRender()
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
watch(() => store.channel, applyChannel)
watch(() => [store.contrastMin, store.contrastMax], applyContrast)
</script>

<style scoped>
.grid-mode { position: absolute; inset: 0; display: flex; flex-direction: column; background: var(--c-bg); }
.grid-viewport { position: relative; display: flex; min-height: 0; flex: 1 1 auto; align-items: flex-start; justify-content: center; overflow: hidden; padding-top: 12px; }
.grid-page { position: relative; flex: 0 0 auto; }
.grid-cell { position: absolute; top: 0; left: 0; overflow: hidden; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: #000; will-change: transform; }
.grid-cell canvas { display: block; }
.slice-badge { position: absolute; top: 6px; left: 6px; padding: 2px 7px; border-radius: 4px; background: rgba(0, 0, 0, 0.62); color: #fff; font: 600 12px var(--font-mono); font-variant-numeric: tabular-nums; pointer-events: none; }
.cell-action { position: absolute; z-index: 3; right: 0; bottom: 0; left: 0; padding: 18px 12px 12px; background: linear-gradient(transparent, rgba(7, 10, 15, 0.96)); opacity: 0; transform: translateY(100%); transition: opacity 0.18s, transform 0.18s; }
.grid-cell:hover .cell-action { opacity: 1; transform: translateY(0); }
.cell-action button { width: 100%; padding: 8px 10px; border: 1px solid var(--c-border-strong); border-radius: var(--radius-sm); background: rgba(17, 22, 29, 0.92); color: var(--c-text-strong); font: 600 12px var(--font-sans); cursor: pointer; }
.cell-action button:hover { border-color: var(--c-accent); color: var(--c-accent); }
.page-strip { flex: 0 0 auto; border-top: 1px solid var(--c-border); background: var(--c-bg-soft); }
.page-rail { display: flex; gap: 0; overflow-x: auto; padding: 10px 18px 12px; }
.page-stop { width: 92px; flex: 0 0 92px; padding: 8px 0 0; border: 0; border-top: 2px solid var(--c-border-strong); background: transparent; color: var(--c-text-muted); font: 11px var(--font-mono); font-variant-numeric: tabular-nums; cursor: pointer; }
.page-stop:hover, .page-stop.active { color: var(--c-text-strong); }
.page-stop.active { border-top-color: var(--c-accent); }
</style>
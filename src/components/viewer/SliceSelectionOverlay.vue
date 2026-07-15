<template>
  <div ref="root" class="selection-overlay" :class="{ editing: enabled }">
    <svg class="selection-svg">
      <rect
        v-if="enabled"
        class="interaction-surface"
        x="0"
        y="0"
        width="100%"
        height="100%"
        @pointerdown="startCreate"
      />
      <g v-if="selectionRect">
        <rect
          :x="selectionRect.x"
          :y="selectionRect.y"
          :width="selectionRect.width"
          :height="selectionRect.height"
          class="selection-rect"
          :class="{ editable: enabled }"
          @pointerdown.stop="startMove"
        />
        <template v-if="enabled">
          <circle v-for="handle in handles" :key="handle.name" :cx="handle.x" :cy="handle.y" r="6" class="selection-handle" @pointerdown.stop="startResize(handle.name, $event)" />
        </template>
      </g>
    </svg>

    <div v-if="showLabel && selectionRect && store.selection" class="selection-label" :style="labelStyle">
      <span>{{ rangeLabel }}</span>
      <button type="button" title="Copy physical range" aria-label="Copy physical range" @click="copyRange">
        <el-icon :size="13"><CopyDocument /></el-icon>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { CopyDocument } from '@element-plus/icons-vue'
import type { State, Vec3 } from 'galavi'
import { sliceDef, type SlicePlane } from '@/galavi-setup'
import { useVISoRStore, type PhysicalSelection } from '@/stores/visor'
import { physicalToSliceScreen, screenToSlicePhysical } from '@/utils/viewCoordinates'

type HandleName = 'north-west' | 'north-east' | 'south-west' | 'south-east'
type DragState =
  | { kind: 'create'; start: Vec3 }
  | { kind: 'move'; start: Vec3; original: PhysicalSelection }
  | { kind: 'resize'; handle: HandleName; original: PhysicalSelection }

const props = withDefaults(defineProps<{
  plane: SlicePlane
  state: State | null
  normalPosition: number
  enabled: boolean
  unit: string
  showLabel?: boolean
}>(), { showLabel: true })

const store = useVISoRStore()
const root = ref<HTMLElement | null>(null)
const size = reactive({ width: 0, height: 0 })
let drag: DragState | null = null
let resizeObserver: ResizeObserver | undefined

function cloneSelection(selection: PhysicalSelection): PhysicalSelection {
  return { min: [...selection.min] as Vec3, max: [...selection.max] as Vec3 }
}

function pointFromEvent(event: PointerEvent): Vec3 | null {
  if (!props.state || !root.value) return null
  const bounds = root.value.getBoundingClientRect()
  return screenToSlicePhysical(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    props.state,
    props.plane,
    size.width,
    size.height,
    props.normalPosition,
  )
}

function startCreate(event: PointerEvent) {
  if (!props.enabled || event.button !== 0) return
  const start = pointFromEvent(event)
  if (!start) return
  drag = { kind: 'create', start }
  store.setSelection({ min: start, max: start })
  event.preventDefault()
}

function startMove(event: PointerEvent) {
  if (!props.enabled || !store.selection) return
  const start = pointFromEvent(event)
  if (!start) return
  drag = { kind: 'move', start, original: cloneSelection(store.selection) }
  event.preventDefault()
}

function startResize(handle: HandleName, event: PointerEvent) {
  if (!props.enabled || !store.selection) return
  drag = { kind: 'resize', handle, original: cloneSelection(store.selection) }
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (!drag) return
  const point = pointFromEvent(event)
  if (!point) return
  const axes = sliceDef(props.plane).axisMap

  if (drag.kind === 'create') {
    const next: PhysicalSelection = { min: [...drag.start] as Vec3, max: [...drag.start] as Vec3 }
    next.min[axes[0]] = Math.min(drag.start[axes[0]], point[axes[0]])
    next.max[axes[0]] = Math.max(drag.start[axes[0]], point[axes[0]])
    next.min[axes[1]] = Math.min(drag.start[axes[1]], point[axes[1]])
    next.max[axes[1]] = Math.max(drag.start[axes[1]], point[axes[1]])
    store.setSelection(next)
    return
  }

  if (drag.kind === 'move') {
    const next = cloneSelection(drag.original)
    for (const axis of [axes[0], axes[1]]) {
      const delta = point[axis] - drag.start[axis]
      next.min[axis] += delta
      next.max[axis] += delta
    }
    store.setSelection(next)
    return
  }

  const next = cloneSelection(drag.original)
  const west = drag.handle.endsWith('west')
  const north = drag.handle.startsWith('north')
  if (west) next.min[axes[0]] = point[axes[0]]
  else next.max[axes[0]] = point[axes[0]]
  if (north) next.max[axes[1]] = point[axes[1]]
  else next.min[axes[1]] = point[axes[1]]
  store.setSelection(next)
}

const selectionRect = computed(() => {
  if (!props.state || !store.selection || size.width <= 0 || size.height <= 0) return null
  const first = physicalToSliceScreen(store.selection.min, props.state, props.plane, size.width, size.height)
  const second = physicalToSliceScreen(store.selection.max, props.state, props.plane, size.width, size.height)
  return {
    x: Math.min(first[0], second[0]),
    y: Math.min(first[1], second[1]),
    width: Math.max(1, Math.abs(second[0] - first[0])),
    height: Math.max(1, Math.abs(second[1] - first[1])),
  }
})

const handles = computed(() => {
  const rect = selectionRect.value
  if (!rect) return []
  return [
    { name: 'north-west' as const, x: rect.x, y: rect.y },
    { name: 'north-east' as const, x: rect.x + rect.width, y: rect.y },
    { name: 'south-west' as const, x: rect.x, y: rect.y + rect.height },
    { name: 'south-east' as const, x: rect.x + rect.width, y: rect.y + rect.height },
  ]
})

const rangeLabel = computed(() => {
  const selection = store.selection
  if (!selection) return ''
  const format = (axis: number) => `${selection.min[axis].toFixed(1)}-${selection.max[axis].toFixed(1)}`
  return `X ${format(0)}  Y ${format(1)}  Z ${format(2)} ${props.unit}`
})

const labelStyle = computed(() => {
  const rect = selectionRect.value
  if (!rect) return {}
  return {
    left: `${Math.max(6, Math.min(size.width - 8, rect.x))}px`,
    top: `${Math.max(6, Math.min(size.height - 32, rect.y + rect.height + 7))}px`,
  }
})

async function copyRange() {
  if (!rangeLabel.value) return
  await navigator.clipboard.writeText(rangeLabel.value)
}

function measure() {
  size.width = root.value?.clientWidth ?? 0
  size.height = root.value?.clientHeight ?? 0
}

function endDrag() {
  drag = null
}

onMounted(() => {
  measure()
  resizeObserver = new ResizeObserver(measure)
  if (root.value) resizeObserver.observe(root.value)
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', endDrag)
})
onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', endDrag)
})
</script>

<style scoped>
.selection-overlay { position: absolute; inset: 0; z-index: 30; pointer-events: none; overflow: hidden; }
.selection-svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; }
.interaction-surface { fill: transparent; pointer-events: all; cursor: crosshair; }
.selection-rect { fill: rgba(255, 208, 91, 0.08); stroke: var(--c-warning); stroke-width: 1.5; vector-effect: non-scaling-stroke; pointer-events: none; }
.selection-rect.editable { pointer-events: all; cursor: move; }
.selection-handle { fill: var(--c-warning); stroke: #111; stroke-width: 1; pointer-events: all; cursor: crosshair; }
.selection-label { position: absolute; z-index: 2; display: flex; align-items: center; gap: 7px; max-width: calc(100% - 12px); padding: 4px 5px 4px 8px; border-radius: var(--radius-sm); background: rgba(9, 12, 17, 0.88); color: var(--c-text-strong); font: 11px var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; pointer-events: auto; }
.selection-label button { display: inline-flex; width: 22px; height: 20px; align-items: center; justify-content: center; flex: 0 0 auto; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--c-text-muted); cursor: pointer; }
.selection-label button:hover { background: var(--c-accent-soft); color: var(--c-accent); }
</style>
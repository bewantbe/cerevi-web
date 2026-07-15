<template>
  <svg v-if="lines.length" class="volume-selection" aria-label="Selected physical region">
    <line v-for="(line, index) in lines" :key="index" :x1="line[0]" :y1="line[1]" :x2="line[2]" :y2="line[3]" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { Camera, Vec2, Vec3 } from 'galavi'
import type { PhysicalSelection } from '@/stores/visor'
import { physicalToVolumeScreen } from '@/utils/viewCoordinates'

const props = defineProps<{
  selection: PhysicalSelection | null
  camera: Camera | null
  width: number
  height: number
}>()

const EDGE_PAIRS = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
  [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7],
] as const

const lines = computed<[number, number, number, number][]>(() => {
  if (!props.selection || !props.camera || props.width <= 0 || props.height <= 0) return []
  const { min, max } = props.selection
  const corners: Vec3[] = [
    [min[0], min[1], min[2]], [max[0], min[1], min[2]],
    [min[0], max[1], min[2]], [max[0], max[1], min[2]],
    [min[0], min[1], max[2]], [max[0], min[1], max[2]],
    [min[0], max[1], max[2]], [max[0], max[1], max[2]],
  ]
  const projected = corners.map((corner) => physicalToVolumeScreen(corner, props.camera!, props.width, props.height))
  return EDGE_PAIRS.flatMap(([first, second]) => {
    const start = projected[first] as Vec2 | null
    const end = projected[second] as Vec2 | null
    return start && end ? [[start[0], start[1], end[0], end[1]] as [number, number, number, number]] : []
  })
})
</script>

<style scoped>
.volume-selection { position: absolute; inset: 0; z-index: 25; width: 100%; height: 100%; pointer-events: none; overflow: hidden; }
.volume-selection line { stroke: var(--c-warning); stroke-width: 1.5; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 2px #000); }
</style>
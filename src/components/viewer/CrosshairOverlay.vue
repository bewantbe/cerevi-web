<template>
  <svg v-if="screenPosition" class="crosshair-overlay" aria-hidden="true">
    <line x1="0" :y1="screenPosition[1]" x2="100%" :y2="screenPosition[1]" />
    <line :x1="screenPosition[0]" y1="0" :x2="screenPosition[0]" y2="100%" />
  </svg>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { State, Vec3 } from 'galavi'
import type { SetupContext, SlicePlane } from '@/galavi-setup'
import { physicalToSliceScreen } from '@/utils/viewCoordinates'

const props = defineProps<{
  ctx: SetupContext
  plane: SlicePlane
  state: State | null
  position: Vec3 | null
  width: number
  height: number
}>()

const screenPosition = computed(() => {
  if (!props.state || !props.position || props.width <= 0 || props.height <= 0) return null
  const point = physicalToSliceScreen(props.position, props.state, props.ctx, props.plane, props.width, props.height)
  if (point[0] < 0 || point[0] > props.width || point[1] < 0 || point[1] > props.height) return null
  return point
})
</script>

<style scoped>
.crosshair-overlay { position: absolute; inset: 0; z-index: 24; width: 100%; height: 100%; overflow: hidden; pointer-events: none; }
.crosshair-overlay line { stroke: rgba(255, 208, 91, 0.92); stroke-width: 1; vector-effect: non-scaling-stroke; filter: drop-shadow(0 0 2px #000); }
</style>
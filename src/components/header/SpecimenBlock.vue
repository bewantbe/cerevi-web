<template>
  <HudBlock
    class="specimen-block"
    label="Specimen"
    side="left"
    position="top"
    :default-open="store.mode === 'volume'"
    :state-key="store.mode"
    :fold-priority="0"
  >
    <div v-if="store.currentSpecimen" class="hud-fields">
      <HudField label="Species" :value="store.currentSpecimen.species ?? '—'" />
      <HudField label="ID" :value="store.currentSpecimen.id" />
      <HudField label="Physical" :value="physicalSize" />
      <HudField label="Voxel" :value="voxelSize" />
      <HudField label="Dtype" :value="dtype" />
      <HudField label="Chunk" :value="chunkSize" />
      <HudField label="Levels" :value="levels" />
      <HudField label="OME-Zarr" :value="omeVersion" />
      <HudField label="Channels" :value="channelCount" />
    </div>
  </HudBlock>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useCereviStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'
import HudField from '@/components/header/HudField.vue'

const store = useCereviStore()

// Image-data fields (ported from the deleted MetadataPopover).
const volumeInfo = computed(() => store.volumeInfo)
const spatialUnit = computed(() => volumeInfo.value?.spatialUnits[0] ?? 'μm')

const physicalSize = computed(() => {
  const info = volumeInfo.value
  if (!info) return '—'
  const { shape, scale } = info.pyramid.levels[0]
  const [sx, sy, sz] = scale
  const [nx, ny, nz] = shape
  return `${(nx * sx).toFixed(0)}×${(ny * sy).toFixed(0)}×${(nz * sz).toFixed(0)} ${spatialUnit.value}`
})

const voxelSize = computed(() => {
  const info = volumeInfo.value
  if (!info) return '—'
  const [sx, sy, sz] = info.pyramid.levels[0].scale
  return `${sx}×${sy}×${sz} ${spatialUnit.value}`
})

const dtype = computed(() => volumeInfo.value?.dtype ?? '—')
const chunkSize = computed(() => volumeInfo.value?.pyramid.levels[0].chunkSize.join('×') ?? '—')
const levels = computed(() => (volumeInfo.value ? String(volumeInfo.value.pyramid.levels.length) : '—'))
const omeVersion = computed(() => (volumeInfo.value ? `v${volumeInfo.value.omeVersion}` : '—'))
const channelCount = computed(() => (store.setupCtx ? String(store.setupCtx.channelCount) : '—'))
</script>

<style scoped>
.specimen-block { z-index: 130; }
.specimen-block :deep(.hud-panel) {
  width: max-content;
  min-width: var(--left-panel-width, 290px);
}
.hud-fields {
  display: flex;
  min-width: calc(var(--left-panel-width, 290px) - 26px);
  flex-direction: column;
  gap: 4px;
}
</style>

<template>
  <div v-if="specimen" class="metadata-popover">
    <div class="info-section">
      <h4 class="section-title">Specimen</h4>
      <div class="info-grid">
        <div class="info-item"><span class="label">Name</span><span class="value">{{ specimen.name }}</span></div>
        <div class="info-item"><span class="label">Species</span><span class="value">{{ specimen.species ?? '—' }}</span></div>
        <div class="info-item"><span class="label">ID</span><span class="value">{{ specimen.id }}</span></div>
      </div>
    </div>

    <div v-if="volumeInfo" class="info-section">
      <h4 class="section-title">Image Data</h4>
      <div class="info-grid">
        <div class="info-item"><span class="label">Physical Size</span><span class="value">{{ formatPhysicalSize(volumeInfo) }}</span></div>
        <div class="info-item"><span class="label">Voxel Size</span><span class="value">{{ formatVoxelSize(volumeInfo) }}</span></div>
        <div class="info-item"><span class="label">Dtype</span><span class="value">{{ volumeInfo.dtype }}</span></div>
        <div class="info-item"><span class="label">Tile Size</span><span class="value">{{ volumeInfo.tileSize.join('×') }}</span></div>
        <div class="info-item"><span class="label">Levels</span><span class="value">{{ volumeInfo.levels.length }}</span></div>
        <div class="info-item"><span class="label">OME-Zarr</span><span class="value">v{{ volumeInfo.omeVersion }}</span></div>
      </div>
    </div>

    <div v-if="channelLabels.length" class="info-section">
      <h4 class="section-title">Channels</h4>
      <div class="channel-list">
        <div v-for="(label, i) in channelLabels" :key="i" class="channel-item">
          <span class="channel-indicator" :style="{ backgroundColor: getChannelColor(i) }"></span>
          <span class="channel-name">{{ label }}</span>
          <span class="channel-number">#{{ i }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { OMEZarrInfo } from '@galavi/ome-zarr-adapter'
import { useVISoRStore } from '@/stores/visor'
import { getChannelColor } from '@/utils/channels'

interface Props {
  volumeInfo?: OMEZarrInfo | null
}
const props = defineProps<Props>()

const visorStore = useVISoRStore()
const specimen = computed(() => visorStore.currentSpecimen)

const channelLabels = computed<string[]>(() => {
  const info = props.volumeInfo
  if (!info) return []
  if (info.omeroChannelLabels?.length) return info.omeroChannelLabels
  const c = info.selectionDims.find((d) => d.name === 'c')
  if (!c) return []
  return c.labels?.length ? c.labels : Array.from({ length: c.size }, (_, i) => `Channel ${i}`)
})

function formatPhysicalSize(info: OMEZarrInfo): string {
  const [sx, sy, sz] = info.transform.scale
  const [nx, ny, nz] = info.rawDataSize
  return `${(nx * sx).toFixed(0)}×${(ny * sy).toFixed(0)}×${(nz * sz).toFixed(0)} ${info.spatialUnits[0] ?? 'μm'}`
}

function formatVoxelSize(info: OMEZarrInfo): string {
  const [sx, sy, sz] = info.transform.scale
  return `${sx}×${sy}×${sz} ${info.spatialUnits[0] ?? 'μm'}`
}
</script>

<style scoped>
.metadata-popover {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 280px;
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  color: #d9e1ea;
}

.info-section {
  border: 1px solid rgba(158, 176, 201, 0.12);
  border-radius: 10px;
  background: rgba(11, 15, 21, 0.56);
  padding: 12px;
}

.section-title {
  margin: 0 0 10px 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #95a6ba;
  border-bottom: 1px solid rgba(158, 176, 201, 0.1);
  padding-bottom: 6px;
}

.info-grid { display: grid; gap: 6px; }

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.info-item .label { color: #8ea0b4; letter-spacing: 0.02em; }
.info-item .value {
  color: #d9e1ea;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: right;
}

.channel-list { display: flex; flex-direction: column; gap: 6px; }

.channel-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  background: rgba(19, 24, 31, 0.7);
  border: 1px solid rgba(158, 176, 201, 0.08);
  font-size: 12px;
}

.channel-indicator { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.channel-name { flex: 1; color: #d9e1ea; }
.channel-number { color: #8ea0b4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
</style>

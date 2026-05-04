<template>
  <div v-if="specimen" class="metadata-popover">
    <div class="info-section">
      <h4 class="section-title">Specimen</h4>
      <div class="info-grid">
        <div class="info-item"><span class="label">Name</span><span class="value">{{ specimen.name }}</span></div>
        <div class="info-item"><span class="label">Species</span><span class="value">{{ specimen.species }}</span></div>
        <div class="info-item"><span class="label">ID</span><span class="value">{{ specimen.id }}</span></div>
        <div class="info-item"><span class="label">Resolution</span><span class="value">{{ specimen.imageInfo.resolutions_um_3d?.[0] ?? 'N/A' }} μm</span></div>
      </div>
    </div>

    <div class="info-section">
      <h4 class="section-title">Image Data</h4>
      <div class="info-grid">
        <div class="info-item"><span class="label">Physical Size</span><span class="value">{{ formatPhysicalSize(specimen.imageInfo.physical_size_um) }}</span></div>
        <div class="info-item"><span class="label">Pixel Format</span><span class="value">{{ specimen.imageInfo.pixel_format }}</span></div>
        <div class="info-item"><span class="label">Tile Size 2D</span><span class="value">{{ specimen.imageInfo.tile_size_2d?.join('×') ?? 'N/A' }}</span></div>
        <div class="info-item"><span class="label">Tile Size 3D</span><span class="value">{{ specimen.imageInfo.tile_size_3d?.join('×') ?? 'N/A' }}</span></div>
        <div class="info-item"><span class="label">2D Levels</span><span class="value">{{ specimen.imageInfo.resolutions_um_2d?.length ?? 0 }}</span></div>
        <div class="info-item"><span class="label">3D Levels</span><span class="value">{{ specimen.imageInfo.resolutions_um_3d?.length ?? 0 }}</span></div>
      </div>
    </div>

    <div v-if="channelList.length" class="info-section">
      <h4 class="section-title">Channels</h4>
      <div class="channel-list">
        <div v-for="(ch, i) in channelList" :key="i" class="channel-item">
          <span class="channel-indicator" :style="{ backgroundColor: getChannelColor(i) }"></span>
          <span class="channel-name">{{ ch.marker }}</span>
          <span class="channel-number">{{ ch.wavelength }}nm</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useVISoRStore } from '@/stores/visor'
import { getChannelColor } from '@/utils/channels'

const visorStore = useVISoRStore()
const specimen = computed(() => visorStore.currentSpecimen)
const channelList = computed(() => specimen.value?.imageInfo.channels ?? [])

function formatPhysicalSize(size: number[]): string {
  if (!size || size.length < 3) return 'N/A'
  const [z, y, x] = size
  return `${x.toFixed(0)}×${y.toFixed(0)}×${z.toFixed(0)} μm`
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

.info-grid {
  display: grid;
  gap: 6px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.info-item .label {
  color: #8ea0b4;
  letter-spacing: 0.02em;
}

.info-item .value {
  color: #d9e1ea;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  text-align: right;
}

.channel-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

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

.channel-indicator {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.channel-name { flex: 1; color: #d9e1ea; }

.channel-number {
  color: #8ea0b4;
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
}
</style>

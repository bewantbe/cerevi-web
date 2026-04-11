<template>
  <div class="metadata-tab">
    <div v-if="!specimen" class="loading-state">
      <el-icon class="is-loading"><Loading /></el-icon>
      <span>Loading metadata...</span>
    </div>

    <div v-else class="metadata-content">
      <!-- Specimen Information -->
      <div class="info-section">
        <h4 class="section-title">Specimen</h4>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Name:</span>
            <span class="value">{{ specimen.name }}</span>
          </div>
          <div class="info-item">
            <span class="label">Species:</span>
            <span class="value">{{ specimen.species }}</span>
          </div>
          <div class="info-item">
            <span class="label">ID:</span>
            <span class="value">{{ specimen.id }}</span>
          </div>
          <div class="info-item">
            <span class="label">Resolution:</span>
            <span class="value">{{ specimen.imageInfo.resolutions_um_3d?.[0] ?? 'N/A' }}μm</span>
          </div>
        </div>
      </div>

      <!-- Image Information -->
      <div class="info-section">
        <h4 class="section-title">Image Data</h4>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Physical Size:</span>
            <span class="value">{{ formatPhysicalSize(specimen.imageInfo.physical_size_um) }}</span>
          </div>
          <div class="info-item">
            <span class="label">Pixel Format:</span>
            <span class="value">{{ specimen.imageInfo.pixel_format }}</span>
          </div>
          <div class="info-item">
            <span class="label">Tile Size (2D):</span>
            <span class="value">{{ specimen.imageInfo.tile_size_2d?.join('×') ?? 'N/A' }}</span>
          </div>
          <div class="info-item">
            <span class="label">Tile Size (3D):</span>
            <span class="value">{{ specimen.imageInfo.tile_size_3d?.join('×') ?? 'N/A' }}</span>
          </div>
          <div class="info-item">
            <span class="label">2D Levels:</span>
            <span class="value">{{ specimen.imageInfo.resolutions_um_2d?.length ?? 0 }}</span>
          </div>
          <div class="info-item">
            <span class="label">3D Levels:</span>
            <span class="value">{{ specimen.imageInfo.resolutions_um_3d?.length ?? 0 }}</span>
          </div>
        </div>
      </div>

      <!-- Channel Information -->
      <div v-if="channelList.length" class="info-section">
        <h4 class="section-title">Channels</h4>
        <div class="channel-list">
          <div v-for="(ch, i) in channelList" :key="i" class="channel-item">
            <div class="channel-indicator" :style="{ backgroundColor: getChannelColor(i) }"></div>
            <span class="channel-name">{{ ch.marker }}</span>
            <span class="channel-number">{{ ch.wavelength }}nm</span>
          </div>
        </div>
      </div>

      <!-- Camera Position -->
      <div class="info-section">
        <h4 class="section-title">Camera Position</h4>
        <div class="position-display">
          <div class="position-item">
            <span class="axis-label">X</span>
            <span class="axis-value">{{ cameraTarget[0].toFixed(1) }}</span>
          </div>
          <div class="position-item">
            <span class="axis-label">Y</span>
            <span class="axis-value">{{ cameraTarget[1].toFixed(1) }}</span>
          </div>
          <div class="position-item">
            <span class="axis-label">Z</span>
            <span class="axis-value">{{ cameraTarget[2].toFixed(1) }}</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="info-section">
        <h4 class="section-title">Quick Actions</h4>
        <div class="action-buttons">
          <el-button size="small" @click="copyPosition">
            <el-icon><CopyDocument /></el-icon>
            Copy Position
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Loading, CopyDocument } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useVISoRStore } from '@/stores/visor'
import type { Galavi } from 'galavi'

interface Props {
  getGalavi: () => Galavi | undefined
}

const props = defineProps<Props>()
const visorStore = useVISoRStore()

const specimen = computed(() => visorStore.currentSpecimen)
const channelList = computed(() => specimen.value?.imageInfo.channels ?? [])

const cameraTarget = computed(() => {
  const galavi = props.getGalavi()
  if (!galavi) return [0, 0, 0]
  return galavi.getState().exploration.camera.target
})

const formatPhysicalSize = (size: number[]) => {
  if (!size || size.length < 3) return 'N/A'
  const [z, y, x] = size
  return `${x.toFixed(0)}×${y.toFixed(0)}×${z.toFixed(0)} μm`
}

const getChannelColor = (ch: number) => {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7']
  return colors[ch % colors.length]
}

const copyPosition = async () => {
  const [x, y, z] = cameraTarget.value
  const text = `X:${x.toFixed(1)}, Y:${y.toFixed(1)}, Z:${z.toFixed(1)}`
  try {
    await navigator.clipboard.writeText(text)
    ElMessage.success('Position copied')
  } catch {
    ElMessage.error('Failed to copy')
  }
}
</script>

<style scoped>
.metadata-tab { height: 100%; overflow-y: auto; }
.loading-state { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 200px; gap: 12px; color: #909399; }
.loading-state .el-icon { font-size: 24px; }
.metadata-content { display: flex; flex-direction: column; gap: 20px; }
.info-section { background: #f8f9fa; border-radius: 8px; padding: 16px; border: 1px solid #e9ecef; }
.section-title { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #303133; border-bottom: 1px solid #e9ecef; padding-bottom: 8px; }
.info-grid { display: grid; gap: 8px; }
.info-item { display: flex; justify-content: space-between; align-items: center; padding: 4px 0; }
.label { font-size: 12px; color: #606266; font-weight: 500; }
.value { font-size: 12px; color: #303133; font-family: monospace; text-align: right; }
.channel-list { display: flex; flex-direction: column; gap: 8px; }
.channel-item { display: flex; align-items: center; gap: 8px; padding: 6px 8px; background: #fff; border-radius: 4px; border: 1px solid #e9ecef; }
.channel-indicator { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.channel-name { flex: 1; font-size: 12px; color: #303133; }
.channel-number { font-size: 10px; color: #909399; font-family: monospace; }
.position-display { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.position-item { display: flex; flex-direction: column; align-items: center; padding: 8px; background: #fff; border-radius: 4px; border: 1px solid #e9ecef; }
.axis-label { font-size: 10px; color: #909399; font-weight: 600; margin-bottom: 2px; }
.axis-value { font-size: 14px; color: #303133; font-family: monospace; font-weight: 600; }
.action-buttons { display: flex; flex-direction: column; gap: 8px; }
.action-buttons .el-button { justify-content: flex-start; }
</style>

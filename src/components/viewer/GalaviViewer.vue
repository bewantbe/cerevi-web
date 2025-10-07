<template>
  <div class="galavi-viewer">
    <div class="viewer-container">
      <canvas ref="viewerCanvas" class="viewer-canvas"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { 
  ElIcon, 
  ElButton, 
  ElButtonGroup, 
  ElSlider 
} from 'element-plus'
import { 
  Loading, 
  Warning, 
  ArrowLeft, 
  ArrowRight, 
  ZoomIn, 
  ZoomOut, 
  Refresh 
} from '@element-plus/icons-vue'
import { useGalavi } from 'galavi'
import * as GalaviTypes from '@galavi/types'
import { useVISoRStore } from '@/stores/visor'

interface Props {
  specimenId: string
  view: 'sagittal' | 'coronal' | 'horizontal'
  channel?: number
  level?: number
}

const props = withDefaults(defineProps<Props>(), {
  channel: 0,
  level: 0
})

// Refs
const viewerCanvas = ref<HTMLCanvasElement>()
const viewer = ref<GalaviTypes.Viewer>()
const tooltipStyle = ref({})

// Store
const visorStore = useVISoRStore()

// Computed properties
const viewName = computed(() => {
  const names = {
    sagittal: 'Sagittal (YZ)',
    coronal: 'Coronal (XZ)', 
    horizontal: 'Horizontal (XY)'
  }
  return names[props.view]
})

const imageDimensions = computed(() => {
  if (!visorStore.imageInfo) {
    // Return safe defaults while loading
    return { x: 1, y: 1, z: 1 }
  }
  const [z, y, x] = visorStore.imageInfo.dimensions
  return { x, y, z }
})

const maxSlice = computed(() => {
  return visorStore.maxSlices[props.view] || 0
})

const selectedRegion = computed(() => visorStore.selectedRegion)

// Slice model for two-way binding with slider

// Methods

// Initialize viewer when component mounts
onMounted(async () => {
  await nextTick()
  if (viewerCanvas.value) {
    
    // Galavi viewer
    viewer.value = await useGalavi("2D", viewerCanvas.value)
    if (viewer.value === null) {
      throw new Error("Failed to initialize Galavi viewer");
    }

    viewer.value!.load("/float16.raw");

    // Render
    viewer.value!.render();
  }
});
</script>

<style scoped>
.galavi-viewer {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 400px;
  background: #000;
  border-radius: 4px;
  overflow: hidden;
}

.viewer-container .viewer-canvas{
  width: 100%;
  height: 100%;
}

.loading-overlay,
.error-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  z-index: 1000;
  gap: 12px;
}

.loading-overlay .el-icon {
  font-size: 32px;
}

.error-overlay .el-icon {
  font-size: 24px;
  color: #f56c6c;
}

.viewer-controls {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.8));
  padding: 20px 16px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  z-index: 100;
}

.coordinates-display {
  display: flex;
  align-items: center;
  gap: 12px;
  color: white;
  font-size: 12px;
  font-family: monospace;
}

.coord-label {
  font-weight: bold;
  color: #409eff;
}

.coord-values {
  color: #e6e6e6;
}

.zoom-level {
  color: #67c23a;
}

.slice-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slice-slider {
  flex: 1;
  margin: 0 12px;
}

.slice-info {
  color: white;
  font-size: 12px;
  min-width: 60px;
  text-align: center;
}

.view-controls {
  align-self: flex-end;
}

.region-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 8px 12px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 200;
  font-size: 12px;
}

.region-name {
  font-weight: bold;
  margin-bottom: 2px;
}

.region-abbrev {
  color: #67c23a;
  font-size: 10px;
}

/* Responsive adjustments */
@media (max-width: 768px) {
  .viewer-controls {
    padding: 12px 8px 8px;
  }
  
  .coordinates-display {
    font-size: 10px;
    flex-wrap: wrap;
  }
  
  .slice-controls {
    flex-wrap: wrap;
  }
  
  .slice-slider {
    margin: 8px 0;
    order: 3;
    flex-basis: 100%;
  }
}

/* Loading state */
.galavi-viewer.loading .viewer-container {
  opacity: 0.5;
}

/* galavi custom styling */
:deep(.galavi-container) {
  background: #000 !important;
}

:deep(.galavi-navigator) {
  border: 1px solid rgba(255, 255, 255, 0.3) !important;
  background: rgba(0, 0, 0, 0.8) !important;
}

:deep(.galavi-navigator .displayregion) {
  border: 2px solid #409eff !important;
}
</style>

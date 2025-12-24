<template>
  <div class="galavi-viewer">
    <div class="viewer-container">
      <canvas ref="viewerCanvas" width="512px" height="512px"></canvas>
    </div>
    <!-- Control overlay -->
    <div class="viewer-controls">
      <!-- Coordinate display -->
      <div class="coordinates-display">
        <span class="coord-label">{{ viewName }}:</span>
        <span class="coord-values">
          X: {{ coordinates[2] }}, 
          Y: {{ coordinates[1] }}, 
          Z: {{ coordinates[0] }}
        </span>
        <span class="zoom-level">Resolution: {{ 2**level }}μm</span>
      </div>
      <!-- Slice controls -->
      <div class="slice-controls">
        <el-button-group size="small">
          <el-button>
            <el-icon><ArrowLeft /></el-icon>
          </el-button>
          <el-button>
            <el-icon><ArrowRight /></el-icon>
          </el-button>
        </el-button-group>
        
        <el-slider
          v-model="sliceModel"
          :min="0"
          :max="maxSlice"
          :step="1"
          class="slice-slider"
          @input="onSliceChange"
        />
        
        <span class="slice-info">{{ coordinates[0] + 1 }} / {{ maxSlice + 1 }}</span>
      </div>

      <!-- View controls -->
      <div class="view-controls">
        <el-button-group size="small">
          <el-button>
            <el-icon><ZoomIn /></el-icon>
          </el-button>
          <el-button>
            <el-icon><ZoomOut /></el-icon>
          </el-button>
          <el-button>
            <el-icon><Refresh /></el-icon>
          </el-button>
        </el-button-group>
      </div>
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
import * as GalaviTypes from '@galavi/types'
import { Viewer, Basic2DScene, PanZoomCtrl } from "galavi";
import { VsrLayer, VsrLayer3D } from "@galavi/layer-vsr";
import { useVISoRStore } from '@/stores/visor'

interface Props {
  specimenId: string
  view: 'coronal' | 'sagittal' | 'horizontal' | '3d'
  isMax?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  channel: 0,
  level: 0,
  isMax: false,
})

// Constants for demo
const coordinates = [128, 0, 0]

// Refs
const viewerCanvas = ref<HTMLCanvasElement>()
const viewer = ref<GalaviTypes.Viewer>()
const level  = ref<number>(7)

// Store
const visorStore = useVISoRStore()

// Computed properties
const viewName = computed(() => {
  const names = {
    coronal: 'Coronal (XY)', 
    sagittal: 'Sagittal (YZ)',
    horizontal: 'Horizontal (XZ)'
  }
  return names[props.view]
})

const imageDimensions = computed(() => {
  if (!visorStore.currentSpecimen?.imageInfo.physical_size_um) {
    // Return safe defaults while loading
    return { x: 1, y: 1, z: 1 }
  }
  const [z, y, x] = visorStore.currentSpecimen.imageInfo.physical_size_um
  return { x, y, z }
})

const maxSlice = computed(() => {
  return visorStore.maxSlices[props.view] || 0
})

const selectedRegion = computed(() => visorStore.selectedRegion)

// Slice model for two-way binding with slider
const sliceModel = computed({
  get: () => 128,
  set: (value: number) => {return;}
})
const onSliceChange = (value: number | number[]) => {
  const sliceValue = Array.isArray(value) ? value[0] : value
  visorStore.setSliceForView(props.view, sliceValue)
}

// Methods

// Initialize viewer when component mounts
onMounted(async () => {
  await nextTick()
  if (viewerCanvas.value) {
    const gviewer = new Viewer(viewerCanvas.value);
    viewer.value = gviewer;

    await gviewer.init();

    // Constants for demo
    const imgSrcPrefix = "https://172.20.175.85:8080/data/RM009:img";
    const RM009Size = [70000,60000,73200];
    const commonImgProps = {
      resRange  : [0,6] as [number,number],
      conRange  : [0.0,0.05] as [number,number],
      ch        : 0,
    };

    if (props.view === 'coronal') {
      const img = {
        src   : imgSrcPrefix + "xy",
        size  : [RM009Size[0], RM009Size[1]],
        z     : 1920,
        axes  : ["x", "y", "z"],
        ...commonImgProps,
      };
      gviewer.useScene(new Basic2DScene(gviewer.device));
      gviewer.useCtrl(new PanZoomCtrl(viewerCanvas.value, gviewer.scene as Basic2DScene));
      gviewer.addLayer(new VsrLayer(gviewer, img, "2D"));
    } else if (props.view === 'sagittal') {
      const img = {
        src   : imgSrcPrefix + "yz",
        size  : [RM009Size[1], RM009Size[2]],
        z     : 1750,
        axes  : ["y", "z", "x"],
        ...commonImgProps,
      };
      gviewer.useScene(new Basic2DScene(gviewer.device));
      gviewer.useCtrl(new PanZoomCtrl(viewerCanvas.value, gviewer.scene as Basic2DScene));
      gviewer.addLayer(new VsrLayer(gviewer, img, "2D"));
    } else if (props.view === 'horizontal') {
      const img = {
        src   : imgSrcPrefix + "xz",
        size  : [RM009Size[0], RM009Size[2]],
        z     : 1500,
        axes  : ["x", "z", "y"],
          ...commonImgProps,
        };
      gviewer.useScene(new Basic2DScene(gviewer.device));
      gviewer.useCtrl(new PanZoomCtrl(viewerCanvas.value, gviewer.scene as Basic2DScene));
      gviewer.addLayer(new VsrLayer(gviewer, img, "2D"));
    } else {
      const img = {
        src   : imgSrcPrefix + "3d",
        size  : RM009Size,
        axes  : ["x", "y", "z"],
        ...commonImgProps,
        resRange  : [0,0] as [number,number], // for test
      };
      gviewer.addLayer(new VsrLayer3D(gviewer, img, "3D"));
    }

    gviewer.loop.start(gviewer.render.bind(gviewer));
  }

  if (props.isMax) {
    viewerCanvas.value!.style.width = '720px'
    viewerCanvas.value!.style.height = '720px'
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

.viewer-container {
  display: flex;
  justify-content: center;
  align-items: center;
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

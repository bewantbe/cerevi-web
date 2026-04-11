<template>
  <div class="atlas-tab">
    <div class="atlas-content">
      <!-- Atlas Overlay Toggle -->
      <div class="control-section">
        <h4 class="section-title">Atlas Overlay</h4>
        <div class="overlay-controls">
          <el-switch
            v-model="atlasVisible"
            active-text="Show Atlas"
            inactive-text="Hide Atlas"
            @change="onToggle"
            class="atlas-switch"
          />
          <div v-if="atlasVisible" class="overlay-status">
            <el-icon class="status-icon"><View /></el-icon>
            <span>Atlas overlay active</span>
          </div>
        </div>
      </div>

      <!-- Opacity Control -->
      <div v-if="atlasVisible" class="control-section">
        <h4 class="section-title">Opacity</h4>
        <div class="slider-container">
          <el-slider
            v-model="opacity"
            :min="0"
            :max="100"
            :step="5"
            show-input
            @change="onOpacityChange"
          />
        </div>
        <div class="preset-buttons">
          <el-button size="small" @click="setOpacity(25)">25%</el-button>
          <el-button size="small" @click="setOpacity(50)">50%</el-button>
          <el-button size="small" @click="setOpacity(75)">75%</el-button>
          <el-button size="small" @click="setOpacity(100)">100%</el-button>
        </div>
      </div>

      <!-- Atlas Information -->
      <div class="control-section">
        <h4 class="section-title">Atlas Information</h4>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Region Layers:</span>
            <span class="value">{{ regionDataIds.length }}</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="control-section">
        <h4 class="section-title">Quick Actions</h4>
        <div class="action-buttons">
          <el-button size="small" @click="resetSettings">
            <el-icon><Refresh /></el-icon>
            Reset Settings
          </el-button>
          <el-button size="small" @click="onToggle(!atlasVisible)">
            <el-icon><Switch /></el-icon>
            Toggle Overlay
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Refresh, Switch, View } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import type { Galavi } from 'galavi'
import { type SetupContext, REGION_DATA_IDS } from '@/galavi-setup'

interface Props {
  getGalavi: () => Galavi | undefined
  setupCtx: SetupContext
}

const props = defineProps<Props>()

const atlasVisible = ref(false)
const opacity = ref(60)
const regionDataIds = REGION_DATA_IDS

function forward(type: string, payload: Record<string, unknown>) {
  props.getGalavi()?.view('ui').forward({ type, payload })
}

function onToggle(val: string | number | boolean) {
  const visible = Boolean(val)
  atlasVisible.value = visible
  for (const id of REGION_DATA_IDS) {
    forward('layer:render', { id, visible })
  }
  ElMessage.success(visible ? 'Atlas overlay enabled' : 'Atlas overlay disabled')
}

function onOpacityChange(value: number | number[]) {
  const val = (Array.isArray(value) ? value[0] : value) / 100
  forward('layer:options', { id: 'regionSurface', material: { opacity: val } })
}

function setOpacity(value: number) {
  opacity.value = value
  onOpacityChange(value)
}

function resetSettings() {
  opacity.value = 60
  atlasVisible.value = false
  for (const id of REGION_DATA_IDS) {
    forward('layer:render', { id, visible: false })
  }
  forward('layer:options', { id: 'regionSurface', material: { opacity: 0.6 } })
  ElMessage.success('Atlas settings reset')
}
</script>

<style scoped>
.atlas-tab { height: 100%; overflow-y: auto; }
.atlas-content { display: flex; flex-direction: column; gap: 20px; }
.control-section { background: #f8f9fa; border-radius: 8px; padding: 16px; border: 1px solid #e9ecef; }
.section-title { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #303133; border-bottom: 1px solid #e9ecef; padding-bottom: 8px; }
.overlay-controls { display: flex; flex-direction: column; gap: 12px; }
.atlas-switch { align-self: flex-start; }
.overlay-status { display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: #e6f7ff; border-radius: 4px; border: 1px solid #91d5ff; color: #0958d9; font-size: 12px; }
.status-icon { font-size: 14px; }
.slider-container { margin-bottom: 12px; }
.preset-buttons { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
.preset-buttons .el-button { font-size: 11px; padding: 6px 8px; }
.info-grid { display: flex; flex-direction: column; gap: 8px; }
.info-item { display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; background: #fff; border-radius: 4px; border: 1px solid #e9ecef; }
.label { font-size: 12px; color: #606266; font-weight: 500; }
.value { font-size: 12px; color: #303133; font-family: monospace; font-weight: 600; }
.action-buttons { display: flex; flex-direction: column; gap: 8px; }
.action-buttons .el-button { justify-content: flex-start; }
</style>

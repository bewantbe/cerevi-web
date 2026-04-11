<template>
  <div class="control-panel" :class="{ collapsed: !isExpanded }">
    <!-- Panel Header -->
    <div class="panel-header">
      <h3 class="panel-title">Controls</h3>
      <el-button 
        type="text" 
        size="small" 
        @click="togglePanel"
        class="toggle-button"
      >
        <el-icon>
          <ArrowLeft v-if="isExpanded" />
          <ArrowRight v-else />
        </el-icon>
      </el-button>
    </div>

    <!-- Panel Content -->
    <div v-if="isExpanded" class="panel-content">
      <el-tabs v-model="activeTab" tab-position="top" class="control-tabs">
        <!-- Metadata Tab -->
        <el-tab-pane label="Info" name="metadata">
          <MetadataTab :get-galavi="getGalavi" />
        </el-tab-pane>

        <!-- Channel Controls Tab -->
        <el-tab-pane label="Channels" name="channels">
          <ChannelTab
            :channels="channels"
            :channel="channel"
            :contrast-min="contrastMin"
            :contrast-max="contrastMax"
            :contrast-bounds="contrastBounds"
            :contrast-step="contrastStep"
            @channel-change="$emit('channel-change', $event)"
            @contrast-change="$emit('contrast-change', $event)"
          />
        </el-tab-pane>

        <!-- Atlas Overlay Tab -->
        <el-tab-pane label="Atlas" name="atlas">
          <AtlasTab :get-galavi="getGalavi" :setup-ctx="setupCtx" />
        </el-tab-pane>

        <!-- Region Browser Tab -->
        <el-tab-pane label="Regions" name="regions">
          <RegionTab />
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- Collapsed State -->
    <div v-else class="collapsed-indicator">
      <el-icon class="indicator-icon">
        <Tools />
      </el-icon>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ArrowLeft, ArrowRight, Tools } from '@element-plus/icons-vue'
import type { Galavi } from 'galavi'
import type { SetupContext } from '@/galavi-setup'
import MetadataTab from './MetadataTab.vue'
import ChannelTab from './ChannelTab.vue'
import AtlasTab from './AtlasTab.vue'
import RegionTab from './RegionTab.vue'

interface Props {
  getGalavi: () => Galavi | undefined
  setupCtx: SetupContext
  channels: number[]
  channel: number
  contrastMin: number
  contrastMax: number
  contrastBounds: [number, number]
  contrastStep: number
  slices: Record<string, any>
}

defineProps<Props>()

defineEmits<{
  'channel-change': [channel: number]
  'contrast-change': [range: [number, number]]
}>()

const isExpanded = ref(true)
const activeTab = ref('metadata')

const togglePanel = () => {
  isExpanded.value = !isExpanded.value
}
</script>

<style scoped>
.control-panel {
  position: relative;
  flex: 0 0 340px;
  width: 340px;
  min-width: 340px;
  min-height: 0;
  background: #fff;
  border-right: 1px solid #e4e7ed;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  transition: width 0.3s ease;
  display: flex;
  flex-direction: column;
}

.control-panel.collapsed {
  width: 48px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #e4e7ed;
  background: #f8f9fa;
  min-height: 60px;
}

.panel-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.toggle-button {
  padding: 8px;
  border-radius: 4px;
}

.panel-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.control-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.control-tabs :deep(.el-tabs__content) {
  min-height: 0;
}

.control-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.control-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 16px;
}

.control-tabs :deep(.el-tabs__header) {
  margin-bottom: 0;
  border-bottom: 1px solid #e4e7ed;
}

.control-tabs :deep(.el-tabs__nav-wrap) {
  padding: 0 16px;
}

.collapsed-indicator {
  display: flex;
  justify-content: center;
  align-items: center;
  flex: 1;
  color: #909399;
}

.indicator-icon {
  font-size: 24px;
  opacity: 0.6;
}

@media (max-width: 1024px) {
  .control-panel {
    position: relative;
    flex: none;
    width: 100%;
    min-width: 0;
    height: auto;
    box-shadow: none;
    border-right: none;
    border-bottom: 1px solid #e4e7ed;
  }

  .control-panel.collapsed {
    width: 100%;
    height: 60px;
  }

  .panel-content {
    max-height: 400px;
  }
}
</style>

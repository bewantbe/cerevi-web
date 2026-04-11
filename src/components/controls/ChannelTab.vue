<template>
  <div class="channel-tab">
    <div class="channel-content">
      <!-- Channel Selection -->
      <div class="control-section">
        <h4 class="section-title">Active Channel</h4>
        <div class="channel-selector">
          <button
            v-for="ch in channels"
            :key="ch"
            type="button"
            class="channel-button"
            :class="{ active: channel === ch }"
            @click="$emit('channel-change', ch)"
          >
            <span class="button-check" :class="{ active: channel === ch }"></span>
            <span
              class="channel-color-indicator"
              :style="{ backgroundColor: getChannelColor(ch) }"
            ></span>
            <span class="channel-info">
              <span class="channel-name">{{ channelLabel(ch) }}</span>
              <span class="channel-wavelength">{{ channelWavelength(ch) }}</span>
            </span>
          </button>
        </div>
      </div>

      <!-- Contrast Control -->
      <div class="control-section">
        <h4 class="section-title">Contrast Range</h4>
        <div class="contrast-row">
          <label class="contrast-label">Min</label>
          <el-slider
            :model-value="contrastMin"
            :min="contrastBounds[0]"
            :max="contrastBounds[1]"
            :step="contrastStep"
            @input="(val: number | number[]) => emitContrastMin(val)"
            @change="(val: number | number[]) => emitContrastMin(val)"
          />
          <span class="contrast-value">{{ contrastMin.toFixed(4) }}</span>
        </div>
        <div class="contrast-row">
          <label class="contrast-label">Max</label>
          <el-slider
            :model-value="contrastMax"
            :min="contrastBounds[0]"
            :max="contrastBounds[1]"
            :step="contrastStep"
            @input="(val: number | number[]) => emitContrastMax(val)"
            @change="(val: number | number[]) => emitContrastMax(val)"
          />
          <span class="contrast-value">{{ contrastMax.toFixed(4) }}</span>
        </div>
        <div class="preset-buttons">
          <el-button size="small" @click="$emit('contrast-change', [0, 0.02])">Low</el-button>
          <el-button size="small" @click="$emit('contrast-change', [0, 0.05])">Default</el-button>
          <el-button size="small" @click="$emit('contrast-change', [0, 0.06])">High</el-button>
        </div>
      </div>

      <!-- Channel Statistics -->
      <div class="control-section">
        <h4 class="section-title">Channel Info</h4>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-label">Current:</span>
            <span class="stat-value">{{ channelLabel(channel) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Wavelength:</span>
            <span class="stat-value">{{ channelWavelength(channel) }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Channels:</span>
            <span class="stat-value">{{ channels.length }}</span>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="control-section">
        <h4 class="section-title">Quick Actions</h4>
        <div class="action-buttons">
          <el-button size="small" @click="cycleChannel">
            <el-icon><Switch /></el-icon>
            Cycle Channel
          </el-button>
          <el-button size="small" @click="$emit('contrast-change', [0, 0.05])">
            <el-icon><Refresh /></el-icon>
            Reset Contrast
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Refresh, Switch } from '@element-plus/icons-vue'
import { useVISoRStore } from '@/stores/visor'

interface Props {
  channels: number[]
  channel: number
  contrastMin: number
  contrastMax: number
  contrastBounds: [number, number]
  contrastStep: number
}

const props = defineProps<Props>()

const emit = defineEmits<{
  'channel-change': [channel: number]
  'contrast-change': [range: [number, number]]
}>()

const visorStore = useVISoRStore()
const channelMeta = computed(() => visorStore.availableChannels)

const getChannelColor = (ch: number) => {
  const colors: Record<number, string> = { 0: '#ff6b6b', 1: '#4ecdc4', 2: '#45b7d1', 3: '#96ceb4' }
  return colors[ch] || '#666'
}

const channelLabel = (ch: number) => {
  const meta = channelMeta.value
  return meta[ch]?.marker ?? `Channel ${ch}`
}

const channelWavelength = (ch: number) => {
  const meta = channelMeta.value
  return meta[ch]?.wavelength ? `${meta[ch].wavelength}nm` : ''
}

const cycleChannel = () => {
  const idx = props.channels.indexOf(props.channel)
  const next = (idx + 1) % props.channels.length
  emit('channel-change', props.channels[next])
}

const normalizeSliderValue = (val: number | number[]) => Array.isArray(val) ? val[0] : val

const emitContrastMin = (val: number | number[]) => {
  emit('contrast-change', [normalizeSliderValue(val), props.contrastMax])
}

const emitContrastMax = (val: number | number[]) => {
  emit('contrast-change', [props.contrastMin, normalizeSliderValue(val)])
}
</script>

<style scoped>
.channel-tab { height: 100%; overflow-y: auto; }
.channel-content { display: flex; flex-direction: column; gap: 20px; }
.control-section { background: #f8f9fa; border-radius: 8px; padding: 16px; border: 1px solid #e9ecef; }
.section-title { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #303133; border-bottom: 1px solid #e9ecef; padding-bottom: 8px; }
.channel-selector { display: flex; flex-direction: column; gap: 8px; }
.channel-button { display: grid; grid-template-columns: 14px 16px minmax(0, 1fr); align-items: center; gap: 10px; width: 100%; padding: 10px 12px; background: #fff; border: 1px solid #e9ecef; border-radius: 8px; text-align: left; }
.channel-button:hover { border-color: #409eff; background: #f0f9ff; }
.channel-button.active { border-color: #409eff; box-shadow: inset 0 0 0 1px #409eff; background: #eaf4ff; }
.button-check { width: 14px; height: 14px; border-radius: 999px; border: 1.5px solid #c0c4cc; background: #fff; }
.button-check.active { border-color: #409eff; box-shadow: inset 0 0 0 4px #409eff; }
.channel-color-indicator { width: 16px; height: 16px; border-radius: 50%; flex-shrink: 0; border: 2px solid #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.1); }
.channel-info { display: flex; flex-direction: column; min-width: 0; }
.channel-name { font-size: 13px; color: #303133; font-weight: 500; }
.channel-wavelength { font-size: 11px; color: #909399; font-family: monospace; }
.contrast-row { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.contrast-label { font-size: 12px; color: #606266; width: 30px; flex-shrink: 0; }
.contrast-row :deep(.el-slider) { flex: 1; }
.contrast-value { font-size: 11px; color: #303133; font-family: monospace; width: 50px; text-align: right; flex-shrink: 0; }
.preset-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-top: 4px; }
.preset-buttons .el-button { font-size: 11px; padding: 6px 8px; }
.stats-grid { display: flex; flex-direction: column; gap: 8px; }
.stat-item { display: flex; justify-content: space-between; padding: 6px 8px; background: #fff; border-radius: 4px; border: 1px solid #e9ecef; }
.stat-label { font-size: 12px; color: #606266; }
.stat-value { font-size: 12px; color: #303133; font-family: monospace; font-weight: 600; }
.action-buttons { display: flex; flex-direction: column; gap: 8px; }
.action-buttons .el-button { justify-content: flex-start; }
</style>

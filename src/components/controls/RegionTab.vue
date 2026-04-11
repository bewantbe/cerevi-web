<template>
  <div class="region-tab">
    <div class="region-content">
      <div class="control-section">
        <h4 class="section-title">Atlas Regions</h4>
        <p class="mode-hint">
          Atlas visibility is controlled in the Atlas tab. Region click-to-show overlays have been removed.
        </p>
      </div>

      <!-- Search -->
      <div class="control-section">
        <h4 class="section-title">Search Regions</h4>
        <el-input
          v-model="searchQuery"
          placeholder="Search regions..."
          clearable
          class="search-input"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <div class="filter-stats">
          <span class="stats-text">
            {{ filteredRegions.length }} of {{ regions.length }} regions
          </span>
        </div>
      </div>

      <!-- Region Tree -->
      <div class="control-section">
        <h4 class="section-title">Region Hierarchy</h4>
        <div class="tree-container">
          <el-tree
            :data="regionTreeData"
            :props="treeProps"
            node-key="id"
            :default-expand-all="false"
            :expand-on-click-node="false"
            :highlight-current="true"
            @node-click="onRegionClick"
            class="region-tree"
          >
            <template #default="{ data }">
              <div class="tree-node">
                <div class="node-content">
                  <span
                    class="region-indicator"
                    :style="{ backgroundColor: getRegionColor(data.id) }"
                  ></span>
                  <span class="region-name">{{ data.name }}</span>
                  <span class="region-abbrev">{{ data.abbreviation }}</span>
                </div>
              </div>
            </template>
          </el-tree>
        </div>
      </div>

      <!-- Selected Region Info -->
      <div v-if="selectedRegion" class="control-section">
        <h4 class="section-title">Selected Region</h4>
        <div class="region-details">
          <div class="detail-header">
            <div
              class="region-color-large"
              :style="{ backgroundColor: getRegionColor(selectedRegion.id) }"
            ></div>
            <div class="region-title">
              <h5 class="region-name-large">{{ selectedRegion.name }}</h5>
              <span class="region-abbrev-large">{{ selectedRegion.abbreviation }}</span>
            </div>
          </div>
          <div class="detail-grid">
            <div class="detail-item">
              <span class="label">ID:</span>
              <span class="value">{{ selectedRegion.id }}</span>
            </div>
            <div class="detail-item">
              <span class="label">Value:</span>
              <span class="value">{{ selectedRegion.value }}</span>
            </div>
          </div>
          <div class="detail-actions">
            <el-button size="small" @click="clearSelection">
              <el-icon><Close /></el-icon>
              Clear
            </el-button>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div class="control-section">
        <h4 class="section-title">Quick Actions</h4>
        <div class="action-buttons">
          <el-button size="small" @click="searchQuery = ''">
            <el-icon><Refresh /></el-icon>
            Clear Search
          </el-button>
          <el-button size="small" @click="exportRegions">
            <el-icon><Download /></el-icon>
            Export List
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search, Close, Refresh, Download } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import { useVISoRStore } from '@/stores/visor'
import type { Region } from '@/types'

const visorStore = useVISoRStore()
const searchQuery = ref('')
const treeProps = { children: 'children', label: 'name' }

const regions = computed(() => visorStore.specimens.length ? [] as Region[] : [])
const selectedRegion = computed(() => visorStore.selectedRegion)

const filteredRegions = computed(() => {
  if (!searchQuery.value) return regions.value
  const q = searchQuery.value.toLowerCase()
  return regions.value.filter(r =>
    r.name.toLowerCase().includes(q) ||
    r.abbreviation.toLowerCase().includes(q)
  )
})

const regionTreeData = computed(() => {
  const list = filteredRegions.value
  const tree: any[] = []
  const lookup: Record<string, any> = {}
  for (const r of list) {
    lookup[r.id] = { ...r, children: [] }
  }
  for (const r of list) {
    const node = lookup[r.id]
    if (r.parent_id && lookup[r.parent_id]) {
      lookup[r.parent_id].children.push(node)
    } else {
      tree.push(node)
    }
  }
  return tree
})

const getRegionColor = (id: number) => {
  const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#ffeaa7', '#fd79a8', '#e17055', '#81ecec', '#74b9ff', '#a29bfe']
  return colors[id % colors.length]
}

const onRegionClick = (data: any) => {
  const region = regions.value.find(r => r.id === data.id)
  if (region) visorStore.setSelectedRegion(region)
}

const clearSelection = () => {
  visorStore.setSelectedRegion(null)
}

const exportRegions = () => {
  try {
    const blob = new Blob([JSON.stringify(filteredRegions.value, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'regions.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    ElMessage.success('Exported')
  } catch {
    ElMessage.error('Failed to export')
  }
}
</script>

<style scoped>
.region-tab { height: 100%; overflow-y: auto; }
.region-content { display: flex; flex-direction: column; gap: 20px; }
.control-section { background: #f8f9fa; border-radius: 8px; padding: 16px; border: 1px solid #e9ecef; }
.section-title { margin: 0 0 12px 0; font-size: 14px; font-weight: 600; color: #303133; border-bottom: 1px solid #e9ecef; padding-bottom: 8px; }
.mode-hint { font-size: 11px; color: #909399; margin-top: 8px; font-style: italic; }
.search-input { width: 100%; margin-bottom: 8px; }
.filter-stats { padding: 6px 10px; background: #e6f7ff; border-radius: 4px; border: 1px solid #91d5ff; }
.stats-text { font-size: 12px; color: #0958d9; font-weight: 500; }
.tree-container { max-height: 400px; overflow-y: auto; border: 1px solid #e9ecef; border-radius: 4px; background: #fff; }
.region-tree { padding: 8px; }
.tree-node { display: flex; justify-content: space-between; align-items: center; width: 100%; padding: 4px 0; }
.node-content { display: flex; align-items: center; gap: 8px; flex: 1; }
.region-indicator { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.region-name { font-size: 12px; color: #303133; }
.region-abbrev { font-size: 10px; color: #909399; font-family: monospace; }
.region-details { display: flex; flex-direction: column; gap: 12px; }
.detail-header { display: flex; gap: 12px; align-items: center; }
.region-color-large { width: 24px; height: 24px; border-radius: 50%; }
.region-title { display: flex; flex-direction: column; }
.region-name-large { margin: 0; font-size: 14px; color: #303133; }
.region-abbrev-large { font-size: 11px; color: #909399; }
.detail-grid { display: flex; flex-direction: column; gap: 6px; }
.detail-item { display: flex; justify-content: space-between; padding: 4px 8px; background: #fff; border-radius: 4px; border: 1px solid #e9ecef; }
.label { font-size: 12px; color: #606266; }
.value { font-size: 12px; color: #303133; font-family: monospace; }
.detail-actions { display: flex; gap: 8px; }
.action-buttons { display: flex; flex-direction: column; gap: 8px; }
.action-buttons .el-button { justify-content: flex-start; }
</style>

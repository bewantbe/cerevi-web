<template>
  <div class="specimen-card" @click="handleClick">
    <div class="card-header">
      <div class="specimen-thumbnail">
        <el-icon class="thumbnail-icon" size="64">
          <View />
        </el-icon>
        <!-- <div class="data-indicators">
          <el-tag v-if="specimen.has_image" size="small" type="primary">Image</el-tag>
          <el-tag v-if="specimen.has_atlas" size="small" type="success">Atlas</el-tag>
          <el-tag v-if="specimen.has_model" size="small" type="warning">3D Model</el-tag>
        </div> -->
      </div>
    </div>
    
    <div class="card-body">
      <h3 class="specimen-name">{{ specimen.name }}</h3>
      <p v-if="specimen.species" class="specimen-species">{{ specimen.species }}</p>
      <p v-if="specimen.description" class="specimen-description">{{ specimen.description }}</p>
    </div>
    
    <div class="card-footer">
      <el-button type="primary" @click.stop="handleExplore">
        <el-icon><View /></el-icon>
        Explore
      </el-button>
      <el-button @click.stop="handleInfo">
        <el-icon><InfoFilled /></el-icon>
        Details
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Specimen } from '@/types'
import { View, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'

interface Props {
  specimen: Specimen
}

const props = defineProps<Props>()

const emit = defineEmits<{
  click: [specimenId: string]
  explore: [specimenId: string]
  info: [specimenId: string]
}>()

function handleClick() {
  emit('click', props.specimen.id)
}

function handleExplore() {
  emit('explore', props.specimen.id)
}

function handleInfo() {
  emit('info', props.specimen.id)
  ElMessage.info(`Detailed information for ${props.specimen.name} coming soon!`)
}
</script>

<style scoped>
.specimen-card {
  background: var(--c-bg-elev);
  border: 1px solid var(--c-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
  cursor: pointer;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.specimen-card:hover {
  border-color: var(--c-border-strong);
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.card-header {
  background: var(--c-bg-soft);
  border-bottom: 1px solid var(--c-divider);
  color: var(--c-text);
  padding: 28px 20px;
  position: relative;
}

.specimen-thumbnail {
  text-align: center;
  position: relative;
}

.thumbnail-icon {
  color: var(--c-accent);
  opacity: 0.8;
  margin-bottom: 0;
}

.data-indicators {
  display: flex;
  gap: 8px;
  justify-content: center;
  flex-wrap: wrap;
  margin-top: 12px;
}

.card-body {
  padding: 20px;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.specimen-name {
  font-size: 1.05rem;
  font-weight: 600;
  margin: 0 0 6px 0;
  color: var(--c-text-strong);
}

.specimen-species {
  font-size: 0.85rem;
  color: var(--c-accent);
  font-weight: 500;
  margin: 0 0 10px 0;
  font-style: italic;
}

.specimen-description {
  color: var(--c-text-muted);
  line-height: 1.55;
  margin: 0 0 16px 0;
  font-size: 0.9rem;
}

.specimen-details {
  background: var(--c-bg-soft);
  border: 1px solid var(--c-divider);
  border-radius: var(--radius-md);
  padding: 14px;
  margin-bottom: 16px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.detail-row:last-child {
  margin-bottom: 0;
}

.detail-label {
  font-size: 0.85rem;
  color: var(--c-text-muted);
  font-weight: 500;
}

.detail-value {
  font-size: 0.85rem;
  color: var(--c-text-strong);
  font-weight: 600;
  font-family: var(--font-mono);
}

.channels-info {
  margin-bottom: 16px;
}

.channels-info h4 {
  font-size: 0.85rem;
  color: var(--c-text-strong);
  margin: 0 0 10px 0;
  font-weight: 600;
}

.channels-list {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 8px;
}

.channel-item {
  background: var(--c-bg-soft);
  border: 1px solid var(--c-divider);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  text-align: center;
  font-size: 0.75rem;
}

.channel-id {
  display: block;
  font-weight: 600;
  color: var(--c-text-strong);
  margin-bottom: 2px;
}

.channel-wavelength {
  color: var(--c-text-muted);
  font-family: var(--font-mono);
}

.card-footer {
  padding: 14px 20px;
  background: var(--c-bg-soft);
  border-top: 1px solid var(--c-divider);
  display: flex;
  gap: 10px;
}

.card-footer .el-button {
  flex: 1;
}

/* Animation for loading states */
.specimen-card.loading {
  opacity: 0.7;
  pointer-events: none;
}

.specimen-card.loading .thumbnail-icon {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
}

/* Responsive design */
@media (max-width: 768px) {
  .channels-list {
    grid-template-columns: repeat(2, 1fr);
  }

  .card-footer {
    flex-direction: column;
  }

  .card-footer .el-button {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .card-body { padding: 16px; }
  .card-header { padding: 20px 16px; }
  .card-footer { padding: 12px 16px; }
  .specimen-details { padding: 12px; }
  .detail-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
  }
}
</style>

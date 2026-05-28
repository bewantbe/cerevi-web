<template>
  <div v-if="isExplorer" class="explorer-topline">
    <router-link to="/" class="floating-logo explorer-logo" aria-label="VISoR home">
      <el-icon class="logo-icon" size="28">
        <View />
      </el-icon>
      <span class="logo-wordmark">VISoR</span>
    </router-link>

    <div class="explorer-tools" aria-live="polite">
      <el-popover
        trigger="hover"
        placement="bottom-start"
        :width="360"
        :show-arrow="false"
        popper-class="specimen-metadata-popper"
      >
        <template #reference>
          <span class="info-indicator" tabindex="-1" aria-label="Specimen info">
            <el-icon size="16">
              <InfoFilled />
            </el-icon>
          </span>
        </template>
        <MetadataPopover :volume-info="visorStore.volumeInfo" />
      </el-popover>

      <el-select
        :model-value="visorStore.currentSpecimen?.id"
        filterable
        placeholder="Select specimen"
        size="small"
        popper-class="specimen-picker-popper"
        class="specimen-select"
        @change="handleSpecimenChange"
      >
        <el-option
          v-for="specimen in visorStore.specimens"
          :key="specimen.id"
          :label="specimen.name"
          :value="specimen.id"
        >
          <div class="specimen-option">
            <span class="specimen-option-name">{{ specimen.name }}</span>
            <span v-if="specimen.species" class="specimen-option-species">{{ specimen.species }}</span>
          </div>
        </el-option>
      </el-select>

      <div class="explorer-readouts">
        <span class="readout">
          <span class="readout-label">Pos</span>
          <span class="readout-value">{{ visorStore.explorerPositionReadout }}</span>
        </span>
        <span class="readout">
          <span class="readout-label">Resolution</span>
          <span class="readout-value">{{ visorStore.explorerResolutionReadout }}</span>
        </span>
      </div>
    </div>
  </div>

  <router-link v-else to="/" class="floating-logo solo-logo" aria-label="VISoR home">
    <el-icon class="logo-icon" size="28">
      <View />
    </el-icon>
    <span class="logo-wordmark">VISoR</span>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVISoRStore } from '@/stores/visor'
import MetadataPopover from '@/components/controls/MetadataPopover.vue'
import { InfoFilled, View } from '@element-plus/icons-vue'

const route = useRoute()
const router = useRouter()
const visorStore = useVISoRStore()
const isExplorer = computed(() => route.name === 'explorer')

function handleSpecimenChange(specimenId: string) {
  if (!specimenId || specimenId === visorStore.currentSpecimen?.id) return
  router.push(`/explorer/${specimenId}`)
}
</script>

<style scoped>
.explorer-topline {
  position: fixed;
  top: 12px;
  left: clamp(18px, 3vw, 48px);
  right: clamp(18px, 3vw, 48px);
  z-index: 1000;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  pointer-events: none;
}

.floating-logo {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  height: 32px;
  color: var(--c-text-strong);
  text-decoration: none;
  transition: opacity 0.18s ease, transform 0.18s ease;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.solo-logo {
  position: fixed;
  top: 12px;
  left: clamp(18px, 3vw, 48px);
  z-index: 1000;
}

.explorer-logo,
.explorer-tools {
  pointer-events: auto;
}

.floating-logo:hover,
.floating-logo:focus,
.floating-logo:focus-visible {
  color: var(--c-text-strong);
  outline: none;
  box-shadow: none;
}

.logo-icon {
  color: var(--c-accent);
  filter: drop-shadow(0 0 14px var(--c-accent-strong));
}

.logo-wordmark {
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 0;
}

.explorer-tools {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 16px;
  min-width: 0;
}

.info-indicator {
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  border: 1px solid var(--c-border);
  border-radius: var(--radius-md);
  background: rgba(11, 14, 19, 0.78);
  color: var(--c-text-muted);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.02) inset;
  backdrop-filter: blur(10px);
  cursor: default;
  outline: none;
}

.info-indicator:hover {
  color: var(--c-text-strong);
  border-color: var(--c-border-strong);
}

.specimen-select {
  width: min(320px, 28vw);
}

.specimen-select :deep(.el-select__wrapper) {
  min-height: 32px;
  background: rgba(11, 14, 19, 0.78);
  box-shadow: 0 0 0 1px var(--c-border) inset !important;
  backdrop-filter: blur(10px);
}

.specimen-select :deep(.el-select__placeholder),
.specimen-select :deep(.el-select__selected-item) {
  color: var(--c-text);
  font-size: 12px;
  font-weight: 600;
}

.specimen-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.25;
}

.specimen-option-name {
  color: var(--c-text);
  font-weight: 500;
}

.specimen-option-species {
  color: var(--c-text-muted);
  font-size: 11px;
}

.explorer-readouts {
  display: flex;
  align-items: center;
  gap: 16px;
  font-family: var(--font-mono);
  white-space: nowrap;
}

.readout {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
}

.readout-label {
  color: var(--c-text-muted);
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.readout-value {
  color: var(--c-text);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

:global(html.home-hero-active .floating-logo) {
  opacity: 0;
  pointer-events: none;
  transform: translateY(-6px);
}

@media (max-width: 620px) {
  .solo-logo,
  .explorer-topline {
    left: 14px;
    right: 14px;
  }

  .logo-wordmark {
    display: none;
  }

  .explorer-tools {
    gap: 10px;
  }

  .specimen-select {
    width: min(230px, 52vw);
  }

  .explorer-readouts {
    display: none;
  }
}
</style>

<style>
.specimen-picker-popper.el-popper {
  background: var(--c-bg-elev);
  border: 1px solid var(--c-border-strong);
}

.specimen-picker-popper .el-select-dropdown__item {
  color: var(--c-text);
}

.specimen-picker-popper .el-select-dropdown__item.is-hovering,
.specimen-picker-popper .el-select-dropdown__item.is-selected {
  background: var(--c-accent-soft);
  color: var(--c-text-strong);
}

.specimen-metadata-popper.el-popper {
  background: rgba(14, 18, 24, 0.94);
  border: 1px solid var(--c-border-strong);
  border-radius: var(--radius-lg);
  box-shadow: 0 22px 70px rgba(0, 0, 0, 0.34);
  backdrop-filter: blur(16px);
  padding: 10px;
}
</style>
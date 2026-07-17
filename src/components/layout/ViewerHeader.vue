<template>
  <header v-if="isViewer" class="viewer-header">
    <div class="header-left">
      <router-link to="/" class="brand" aria-label="Cerevi home">
        <el-icon class="brand-icon" :size="22"><View /></el-icon>
        <span>Cerevi</span>
      </router-link>

      <el-select
        :model-value="store.currentSpecimen?.id"
        filterable
        size="default"
        placeholder="Specimen"
        class="specimen-select"
        :style="{ width: `${specimenSelectWidth}px` }"
        @change="changeSpecimen"
      >
        <el-option v-for="specimen in store.specimens" :key="specimen.id" :label="specimen.name" :value="specimen.id">
          <div class="specimen-option">
            <span>{{ specimen.name }}</span>
            <small v-if="specimen.species">{{ specimen.species }}</small>
          </div>
        </el-option>
      </el-select>

      <el-popover trigger="hover" placement="bottom-start" :width="360" :show-arrow="false" popper-class="specimen-metadata-popper">
        <template #reference>
          <button type="button" class="icon-button info-button" title="Specimen info" aria-label="Specimen info">
            <el-icon :size="16"><InfoFilled /></el-icon>
          </button>
        </template>
        <MetadataPopover :volume-info="store.volumeInfo" />
      </el-popover>

      <el-select
        v-if="showView"
        :model-value="store.plane"
        size="default"
        class="view-select"
        aria-label="View"
        @change="(plane: SlicePlane) => store.setPlane(plane)"
      >
        <el-option v-for="plane in planes" :key="plane.key" :label="plane.label" :value="plane.key" />
      </el-select>

      <el-select
        v-if="showChannel"
        :model-value="store.channel"
        size="default"
        class="channel-select"
        :style="{ width: `${channelSelectWidth}px` }"
        aria-label="Channel"
        @change="(channel: number) => store.setChannel(Number(channel))"
      >
        <el-option v-for="channel in store.setupCtx?.channels ?? []" :key="channel.index" :label="channel.label" :value="channel.index" />
      </el-select>

      <div v-if="showContrast" class="contrast-control" aria-label="Contrast">
        <span>Contrast</span>
        <DualRangeSlider
          :model-value="[store.contrastMin, store.contrastMax]"
          :bounds="store.contrastRange"
          :step="0.001"
          scale="log"
          :show-value="false"
          @update:model-value="store.setContrast"
        />
      </div>
    </div>

    <div class="header-right">
      <el-popover v-if="showToolbox" trigger="hover" placement="bottom" :width="154" :show-arrow="false" :show-after="40" popper-class="toolbox-popper">
        <template #reference>
          <button type="button" class="icon-button toolbox-button" :class="{ active: anyToolEnabled }" title="Toolbox" aria-label="Toolbox">
            <el-icon :size="17"><Tools /></el-icon>
          </button>
        </template>
        <div class="toolbox" role="toolbar" aria-label="Viewer tools">
          <button type="button" :class="{ active: store.isToolEnabled('ruler') }" title="Ruler" aria-label="Ruler" @click="store.toggleTool('ruler')">
            <el-icon class="slanted" :size="18"><ScaleToOriginal /></el-icon>
          </button>
          <button type="button" :class="{ active: store.isToolEnabled('magnifier') }" title="Magnifier" aria-label="Magnifier" @click="store.toggleTool('magnifier')">
            <el-icon class="slanted" :size="18"><ZoomIn /></el-icon>
          </button>
          <button type="button" :class="{ active: store.isToolEnabled('selector') }" :disabled="!store.isToolAvailable('selector')" title="Selector" aria-label="Selector" @click="store.toggleTool('selector')">
            <el-icon :size="18"><Crop /></el-icon>
          </button>
        </div>
      </el-popover>

      <div v-if="store.mode !== 'grid'" class="readouts" aria-live="polite">
        <span><b>POS</b>{{ store.positionReadout }}</span>
        <span><b>RESOLUTION</b>{{ store.resolutionReadout }}</span>
      </div>

      <div class="mode-selector" role="tablist" aria-label="View mode">
        <button type="button" :class="{ active: store.mode === 'volume' }" role="tab" :aria-selected="store.mode === 'volume'" title="3D volume" @click="store.setMode('volume')">
          <el-icon :size="17"><StereoCubeIcon /></el-icon>
        </button>
        <button type="button" :class="{ active: store.mode === 'quadrant' }" role="tab" :aria-selected="store.mode === 'quadrant'" title="Four quadrant" @click="store.setMode('quadrant')">
          <span class="quadrant-glyph" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        </button>
        <button type="button" :class="{ active: store.mode === 'slice' }" role="tab" :aria-selected="store.mode === 'slice'" title="2D slice" @click="store.setMode('slice')">
          <span class="slice-glyph" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        </button>
        <button type="button" :class="{ active: store.mode === 'grid' }" role="tab" :aria-selected="store.mode === 'grid'" title="2D grid" @click="store.setMode('grid')">
          <span class="grid-glyph" aria-hidden="true"><i v-for="index in 9" :key="index"></i></span>
        </button>
      </div>
    </div>
  </header>

  <router-link v-else to="/" class="home-brand" aria-label="Cerevi home">
    <el-icon class="brand-icon" :size="26"><View /></el-icon>
    <span>Cerevi</span>
  </router-link>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Crop, InfoFilled, ScaleToOriginal, Tools, View, ZoomIn } from '@element-plus/icons-vue'
import { planeLabel, type SlicePlane } from '@/galavi-setup'
import { TOOL_NAMES, useVISoRStore } from '@/stores/visor'
import MetadataPopover from '@/components/controls/MetadataPopover.vue'
import DualRangeSlider from '@/components/viewer/DualRangeSlider.vue'
import StereoCubeIcon from '@/components/viewer/StereoCubeIcon.vue'

const store = useVISoRStore()
const route = useRoute()
const router = useRouter()
const isViewer = computed(() => route.name === 'specimen')
const showView = computed(() => store.mode === 'grid')
const showChannel = computed(() => store.mode !== 'slice')
const showContrast = computed(() => store.mode !== 'slice')
const showToolbox = computed(() => store.mode !== 'grid')
const anyToolEnabled = computed(() => TOOL_NAMES.some((tool) => store.isToolEnabled(tool)))
const planes = (['xy', 'xz', 'yz'] as SlicePlane[]).map((key) => ({ key, label: planeLabel(key) }))

function changeSpecimen(specimenId: string) {
  if (specimenId && specimenId !== store.currentSpecimen?.id) router.push(`/specimen/${specimenId}`)
}

function measureTextWidth(text: string, font = "14px var(--font-sans)"): number {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0
  ctx.font = font
  return ctx.measureText(text).width
}

const specimenSelectWidth = computed(() => {
  const names = store.specimens.map((specimen) => specimen.name)
  const species = store.specimens.map((specimen) => specimen.species).filter((value): value is string => Boolean(value))
  const all = [...names, ...species, 'Specimen']
  const max = Math.max(0, ...all.map((text) => measureTextWidth(text)))
  return Math.min(Math.max(Math.ceil(max) + 120, 220), 520)
})

const channelSelectWidth = computed(() => {
  const labels = store.setupCtx?.channels.map((channel) => channel.label) ?? []
  const all = [...labels, 'Channel']
  const max = Math.max(0, ...all.map((text) => measureTextWidth(text)))
  return Math.min(Math.max(Math.ceil(max) + 100, 180), 400)
})
</script>

<style scoped>
.viewer-header { height: 52px; display: flex; align-items: center; flex: 0 0 auto; gap: 10px; padding: 0 12px; overflow-x: auto; overflow-y: hidden; border-bottom: 1px solid var(--c-border); background: var(--c-bg-soft); z-index: 100; scrollbar-width: none; }
.viewer-header::-webkit-scrollbar { display: none; }
.header-left { display: flex; align-items: center; gap: 10px; flex: 1 1 auto; min-width: 0; }
.header-right { display: flex; align-items: center; gap: 10px; margin-left: auto; flex: 0 0 auto; }
.brand, .home-brand { display: inline-flex; align-items: center; gap: 8px; color: var(--c-text-strong); font-size: 18px; font-weight: 700; text-decoration: none; white-space: nowrap; }
.brand-icon { color: var(--c-accent); filter: drop-shadow(0 0 10px var(--c-accent-strong)); }
.specimen-select { flex: 0 0 auto; }
.view-select { width: 160px; flex: 0 0 auto; }
.channel-select { flex: 0 0 auto; }
.specimen-option { display: flex; flex-direction: column; line-height: 1.2; }
.specimen-option small { color: var(--c-text-muted); }
.icon-button { display: inline-flex; width: 32px; height: 32px; align-items: center; justify-content: center; flex: 0 0 auto; padding: 0; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-bg-elev); color: var(--c-text-muted); cursor: pointer; }
.icon-button:hover { border-color: var(--c-border-strong); color: var(--c-text-strong); }
.toolbox-button.active { border-color: var(--c-accent); color: var(--c-accent); background: var(--c-accent-soft); }
.contrast-control { display: flex; width: 208px; min-width: 170px; align-items: center; gap: 8px; flex: 0 0 auto; color: var(--c-text-faint); font-size: 11px; font-weight: 700; text-transform: uppercase; }
.contrast-control :deep(.range-inputs) { flex: 1; }
.readouts { display: flex; align-items: center; gap: 12px; flex: 0 0 auto; font: 12px var(--font-mono); font-variant-numeric: tabular-nums; white-space: nowrap; }
.readouts span { display: inline-flex; align-items: baseline; gap: 6px; color: var(--c-text); }
.readouts b { color: var(--c-text-faint); font-size: 11px; letter-spacing: 0.06em; }
.mode-selector { display: inline-flex; align-items: center; gap: 2px; flex: 0 0 auto; padding: 2px; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-bg-elev); }
.mode-selector button { display: inline-flex; width: 32px; height: 28px; align-items: center; justify-content: center; padding: 0; border: 0; border-radius: 3px; background: transparent; color: var(--c-text-muted); cursor: pointer; }
.mode-selector button:hover { color: var(--c-text-strong); }
.mode-selector button.active { background: var(--c-accent-soft); color: var(--c-accent); }
.quadrant-glyph, .grid-glyph { display: grid; width: 16px; height: 16px; gap: 2px; }
.quadrant-glyph { grid-template-columns: repeat(2, 1fr); grid-template-rows: repeat(2, 1fr); }
.grid-glyph { grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 1.5px; }
.quadrant-glyph i, .grid-glyph i, .slice-glyph i { border: 1px solid currentColor; }
.slice-glyph { display: grid; width: 17px; height: 16px; grid-template-columns: 5px 1fr; grid-template-rows: repeat(3, 1fr); gap: 1.5px; }
.slice-glyph i:last-child { grid-column: 2; grid-row: 1 / 4; }
.home-brand { position: fixed; top: 12px; left: clamp(18px, 3vw, 48px); z-index: 1000; font-size: 18px; }
:global(html.home-hero-active .home-brand) { opacity: 0; pointer-events: none; }
@media (max-width: 1050px) { .readouts { display: none; } }
@media (max-width: 720px) { .brand span { display: none; } .specimen-select { max-width: 180px !important; } .channel-select { max-width: 150px !important; } .contrast-control { width: 160px; } }
</style>

<style>
.toolbox-popper.el-popper, .specimen-metadata-popper.el-popper { border: 1px solid var(--c-border-strong); background: var(--c-bg-elev); }
.toolbox { display: flex; align-items: center; justify-content: center; gap: 6px; }
.toolbox button { display: inline-flex; width: 36px; height: 34px; align-items: center; justify-content: center; padding: 0; border: 1px solid var(--c-border); border-radius: var(--radius-sm); background: var(--c-bg-soft); color: var(--c-text-muted); cursor: pointer; }
.toolbox button:hover:not(:disabled) { color: var(--c-text-strong); }
.toolbox button.active { border-color: var(--c-accent); background: var(--c-accent-soft); color: var(--c-accent); }
.toolbox button:disabled { opacity: 0.34; cursor: not-allowed; }
.toolbox .slanted { transform: rotate(-24deg); }
</style>
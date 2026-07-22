<template>
  <div class="viewer-shell">
    <template v-if="store.setupCtx">
      <VolumeMode v-if="store.mode === 'volume'" :ctx="store.setupCtx" />
      <QuadrantMode v-else-if="store.mode === 'quadrant'" :ctx="store.setupCtx" />
      <SliceMode v-else-if="store.mode === 'slice'" :ctx="store.setupCtx" />
      <GridMode v-else :ctx="store.setupCtx" />
    </template>

    <div v-else class="viewer-status">
      <template v-if="store.ctxLoading || store.loading">
        <h1>Loading specimen</h1>
        <p>Preparing {{ specimenId }}...</p>
      </template>
      <template v-else>
        <h1>Specimen unavailable</h1>
        <p>{{ store.error ?? `No specimen matches "${specimenId}".` }}</p>
        <button type="button" @click="router.push('/')">Back to home</button>
      </template>
    </div>

    <!-- Edgeless HUD blocks (specimen route only — this shell exists nowhere else). -->
    <SpecimenBlock />
    <ModeTabs />
    <ChannelBlock />
    <ReadoutBlock />
    <ToolboxBlock />
  </div>
</template>

<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVISoRStore } from '@/stores/visor'
import VolumeMode from '@/components/viewer/modes/VolumeMode.vue'
import QuadrantMode from '@/components/viewer/modes/QuadrantMode.vue'
import SliceMode from '@/components/viewer/modes/SliceMode.vue'
import GridMode from '@/components/viewer/modes/GridMode.vue'
import SpecimenBlock from '@/components/header/SpecimenBlock.vue'
import ModeTabs from '@/components/header/ModeTabs.vue'
import ChannelBlock from '@/components/header/ChannelBlock.vue'
import ReadoutBlock from '@/components/header/ReadoutBlock.vue'
import ToolboxBlock from '@/components/header/ToolboxBlock.vue'

const props = defineProps<{ specimenId: string }>()
const store = useVISoRStore()
const router = useRouter()

async function resolveSpecimen() {
  if (store.specimens.length === 0) await store.loadSpecimens()
  if (store.currentSpecimen?.id === props.specimenId && store.setupCtx) return
  await store.selectSpecimen(props.specimenId)
}

onMounted(() => void resolveSpecimen())
watch(() => props.specimenId, () => void resolveSpecimen())
</script>

<style scoped>
.viewer-shell { position: absolute; inset: 0; overflow: hidden; background: var(--app-bg); color: var(--galavi-text); }
.viewer-status { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 10px; padding: 24px; text-align: center; }
.viewer-status h1 { margin: 0; color: var(--galavi-text); font-size: 20px; letter-spacing: 0; }
.viewer-status p { margin: 0; color: var(--galavi-text-dim); }
.viewer-status button { margin-top: 8px; padding: 8px 13px; border: 1px solid var(--galavi-border); border-radius: var(--radius-sm); background: var(--app-bg-elev); color: var(--galavi-text); font: inherit; cursor: pointer; }
.viewer-status button:hover { border-color: var(--galavi-accent); color: var(--galavi-accent); }
</style>
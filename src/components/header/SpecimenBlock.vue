<template>
  <HudBlock label="Specimen" placement="tl" :fold-priority="2">
    <div ref="dropdownEl" class="specimen-dropdown" @keydown.esc="dropdownOpen = false">
      <button
        type="button"
        class="specimen-current"
        :aria-expanded="dropdownOpen"
        aria-haspopup="listbox"
        @click="dropdownOpen = !dropdownOpen"
      >
        <span class="specimen-name">{{ store.currentSpecimen?.name ?? 'Select specimen' }}</span>
        <span class="chevron" :class="{ open: dropdownOpen }" aria-hidden="true"></span>
      </button>

      <div v-if="dropdownOpen" class="specimen-list" role="listbox" aria-label="Specimens">
        <input
          ref="filterEl"
          v-model="filter"
          type="search"
          class="specimen-filter"
          placeholder="Filter"
          aria-label="Filter specimens"
        />
        <div class="specimen-options">
          <button
            v-for="specimen in filteredSpecimens"
            :key="specimen.id"
            type="button"
            role="option"
            :aria-selected="specimen.id === store.currentSpecimen?.id"
            class="specimen-option"
            :class="{ active: specimen.id === store.currentSpecimen?.id }"
            @click="chooseSpecimen(specimen.id)"
          >
            <span class="option-name">{{ specimen.name }}</span>
            <small v-if="specimen.species" class="option-species">{{ specimen.species }}</small>
          </button>
          <p v-if="filteredSpecimens.length === 0" class="specimen-empty">No specimens match.</p>
        </div>
      </div>
    </div>

    <div v-if="store.currentSpecimen" class="hud-fields">
      <HudField label="Species" :value="store.currentSpecimen.species ?? '—'" />
      <HudField label="ID" :value="store.currentSpecimen.id" />
      <HudField label="Physical" :value="physicalSize" />
      <HudField label="Voxel" :value="voxelSize" />
      <HudField label="Dtype" :value="dtype" />
      <HudField label="Chunk" :value="chunkSize" />
      <HudField label="Levels" :value="levels" />
      <HudField label="OME-Zarr" :value="omeVersion" />
      <HudField label="Channels" :value="channelCount" />
    </div>
  </HudBlock>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useVISoRStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'
import HudField from '@/components/header/HudField.vue'

const store = useVISoRStore()
const router = useRouter()

const dropdownEl = ref<HTMLElement | null>(null)
const filterEl = ref<HTMLInputElement | null>(null)
const dropdownOpen = ref(false)
const filter = ref('')

const filteredSpecimens = computed(() => {
  const query = filter.value.trim().toLowerCase()
  if (!query) return store.specimens
  return store.specimens.filter((specimen) =>
    [specimen.name, specimen.species, specimen.id]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(query))
})

function chooseSpecimen(specimenId: string) {
  dropdownOpen.value = false
  if (specimenId && specimenId !== store.currentSpecimen?.id) {
    router.push(`/specimen/${specimenId}`)
  }
}

watch(dropdownOpen, async (open) => {
  if (!open) return
  filter.value = ''
  await nextTick()
  filterEl.value?.focus()
})

function onDocumentMouseDown(event: MouseEvent) {
  if (dropdownOpen.value && dropdownEl.value && !dropdownEl.value.contains(event.target as Node)) {
    dropdownOpen.value = false
  }
}

onMounted(() => document.addEventListener('mousedown', onDocumentMouseDown))
onBeforeUnmount(() => document.removeEventListener('mousedown', onDocumentMouseDown))

// Image-data fields (ported from the deleted MetadataPopover).
const volumeInfo = computed(() => store.volumeInfo)
const spatialUnit = computed(() => volumeInfo.value?.spatialUnits[0] ?? 'μm')

const physicalSize = computed(() => {
  const info = volumeInfo.value
  if (!info) return '—'
  const { shape, scale } = info.pyramid.levels[0]
  const [sx, sy, sz] = scale
  const [nx, ny, nz] = shape
  return `${(nx * sx).toFixed(0)}×${(ny * sy).toFixed(0)}×${(nz * sz).toFixed(0)} ${spatialUnit.value}`
})

const voxelSize = computed(() => {
  const info = volumeInfo.value
  if (!info) return '—'
  const [sx, sy, sz] = info.pyramid.levels[0].scale
  return `${sx}×${sy}×${sz} ${spatialUnit.value}`
})

const dtype = computed(() => volumeInfo.value?.dtype ?? '—')
const chunkSize = computed(() => volumeInfo.value?.pyramid.levels[0].chunkSize.join('×') ?? '—')
const levels = computed(() => (volumeInfo.value ? String(volumeInfo.value.pyramid.levels.length) : '—'))
const omeVersion = computed(() => (volumeInfo.value ? `v${volumeInfo.value.omeVersion}` : '—'))
const channelCount = computed(() => (store.setupCtx ? String(store.setupCtx.channelCount) : '—'))
</script>

<style scoped>
.specimen-dropdown { position: relative; }

.specimen-current {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 8px;
  border: 1px solid var(--galavi-border);
  border-radius: 2px;
  background: transparent;
  color: var(--galavi-text);
  font: inherit;
  cursor: pointer;
}
.specimen-current:hover,
.specimen-current[aria-expanded='true'] {
  border-color: var(--galavi-accent);
  box-shadow: 0 0 8px var(--galavi-accent-soft);
}

.specimen-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chevron {
  width: 0;
  height: 0;
  flex: 0 0 auto;
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
  border-top: 5px solid var(--galavi-text-dim);
  transition: transform 0.18s ease;
}
.chevron.open { transform: rotate(180deg); }

.specimen-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.specimen-filter {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--galavi-border);
  border-radius: 2px;
  outline: 0;
  background: transparent;
  color: var(--galavi-text);
  font: inherit;
}
.specimen-filter:focus {
  border-color: var(--galavi-accent);
  box-shadow: 0 0 8px var(--galavi-accent-soft);
}
.specimen-filter::placeholder { color: var(--galavi-text-dim); }

.specimen-options {
  display: flex;
  max-height: 220px;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
}

.specimen-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px 8px;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--galavi-text);
  font: inherit;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
}
.specimen-option:hover { border-color: var(--galavi-border); }
.specimen-option.active {
  border-color: var(--galavi-accent);
  background: var(--galavi-accent-soft);
}
.option-species { color: var(--galavi-text-dim); }

.specimen-empty {
  margin: 4px 0;
  color: var(--galavi-text-dim);
}

.hud-fields {
  display: flex;
  min-width: 240px;
  flex-direction: column;
  gap: 4px;
}
</style>

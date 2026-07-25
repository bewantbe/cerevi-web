<template>
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
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useCereviStore } from '@/stores/visor'

const store = useCereviStore()
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
</script>

<style scoped>
.specimen-dropdown {
  position: relative;
  pointer-events: auto;
  font: inherit;
  font-size: 10px;
}

.specimen-current {
  display: flex;
  max-width: min(320px, 40vw);
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 3px 8px;
  border: 1px solid var(--galavi-border);
  border-radius: 2px;
  background: transparent;
  color: var(--galavi-text);
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

/* Drops below the 30px header instead of growing a panel in-flow. */
.specimen-list {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  z-index: 1001;
  display: flex;
  width: 260px;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--galavi-border);
  background:
    linear-gradient(135deg, var(--galavi-accent-soft), transparent 34%),
    var(--galavi-panel-bg);
  backdrop-filter: blur(18px) saturate(130%);
  box-shadow: 0 0 18px var(--galavi-accent-soft), var(--shadow-lg);
  clip-path: polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px));
}

.specimen-filter {
  width: 100%;
  padding: 5px 8px;
  border: 1px solid var(--galavi-border);
  border-radius: 2px;
  outline: 0;
  background: transparent;
  color: var(--galavi-text);
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
</style>

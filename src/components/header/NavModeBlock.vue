<template>
  <HudBlock
    v-if="store.mode === 'volume'"
    label="Nav"
    side="right"
    position="second"
    :default-open="false"
    :state-key="store.mode"
    :show-header="false"
    toggle-on-hover
  >
    <template #tab>
      <span class="nav-tab-icon" aria-hidden="true">
        <svg v-if="store.navMode === 'orbit'" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2">
          <circle cx="8" cy="8" r="2.6" />
          <ellipse cx="8" cy="8" rx="7" ry="2.9" transform="rotate(-24 8 8)" />
          <circle cx="13.6" cy="5.2" r="1.1" fill="currentColor" stroke="none" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round">
          <path d="M1.5 14.5 14.5 1.5l-4.2 13-2.5-5.3-5.3-2.5Z" />
          <path d="M14.5 1.5 7.8 9.2" />
        </svg>
      </span>
    </template>
    <div class="nav-modes" role="radiogroup" aria-label="Camera navigation">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        :class="{ active: store.navMode === option.value }"
        :aria-checked="store.navMode === option.value"
        role="radio"
        @click="store.setNavMode(option.value)"
      >
        <svg v-if="option.value === 'orbit'" viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true">
          <circle cx="8" cy="8" r="2.6" />
          <ellipse cx="8" cy="8" rx="7" ry="2.9" transform="rotate(-24 8 8)" />
          <circle cx="13.6" cy="5.2" r="1.1" fill="currentColor" stroke="none" />
        </svg>
        <svg v-else viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" aria-hidden="true">
          <path d="M1.5 14.5 14.5 1.5l-4.2 13-2.5-5.3-5.3-2.5Z" />
          <path d="M14.5 1.5 7.8 9.2" />
        </svg>
        {{ option.label }}
      </button>
    </div>
  </HudBlock>
</template>

<script setup lang="ts">
import { useCereviStore, type NavMode } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'

const store = useCereviStore()
const options: { value: NavMode; label: string }[] = [
  { value: 'orbit', label: 'ORBIT' },
  { value: 'fly', label: 'FLY' },
]
</script>

<style scoped>
.nav-tab-icon {
  display: grid;
  place-items: center;
}

.nav-modes {
  display: flex;
  min-width: 150px;
  flex-direction: column;
  gap: 4px;
}

.nav-modes button {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 9px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--galavi-text-dim);
  font: inherit;
  font-size: 11px;
  letter-spacing: 0.14em;
  text-align: left;
  cursor: pointer;
}
.nav-modes button:hover { color: var(--galavi-text); }
.nav-modes button.active {
  border-color: var(--galavi-accent);
  background: var(--galavi-accent-soft);
  color: var(--galavi-accent);
}
.nav-modes button svg { flex: 0 0 auto; }
</style>

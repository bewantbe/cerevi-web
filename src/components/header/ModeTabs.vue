<template>
  <HudBlock label="Mode" placement="tc" :fold-priority="3">
    <div class="mode-tabs" role="tablist" aria-label="View mode">
      <button type="button" :class="{ active: store.mode === 'volume' }" role="tab" :aria-selected="store.mode === 'volume'" title="3D volume" @click="store.setMode('volume')">
        <span class="volume-glyph" aria-hidden="true"></span>
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
  </HudBlock>
</template>

<script setup lang="ts">
import { useVISoRStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'

const store = useVISoRStore()
</script>

<style scoped>
.mode-tabs {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.mode-tabs button {
  display: inline-flex;
  width: 34px;
  height: 28px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 1px solid transparent;
  border-radius: 2px;
  background: transparent;
  color: var(--galavi-text-dim);
  cursor: pointer;
}
.mode-tabs button:hover { color: var(--galavi-text); }
.mode-tabs button.active {
  border-color: var(--galavi-border);
  background: var(--galavi-accent-soft);
  color: var(--galavi-accent);
  box-shadow: 0 0 8px var(--galavi-accent-soft);
}

/* Volume = single square glyph (replaces the deleted StereoCubeIcon). */
.volume-glyph {
  width: 11px;
  height: 11px;
  border: 1px solid currentColor;
}

.quadrant-glyph,
.grid-glyph {
  display: grid;
  width: 16px;
  height: 16px;
  gap: 2px;
}
.quadrant-glyph {
  grid-template-columns: repeat(2, 1fr);
  grid-template-rows: repeat(2, 1fr);
}
.grid-glyph {
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: repeat(3, 1fr);
  gap: 1.5px;
}
.quadrant-glyph i,
.grid-glyph i,
.slice-glyph i { border: 1px solid currentColor; }

.slice-glyph {
  display: grid;
  width: 17px;
  height: 16px;
  grid-template-columns: 5px 1fr;
  grid-template-rows: repeat(3, 1fr);
  gap: 1.5px;
}
.slice-glyph i:last-child {
  grid-column: 2;
  grid-row: 1 / 4;
}
</style>

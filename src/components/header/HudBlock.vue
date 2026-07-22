<template>
  <div class="hud-block" :class="[`hud-${placement}`, { folded: isFolded }]">
    <button
      v-if="isFolded"
      type="button"
      class="hud-tab"
      :aria-label="`Expand ${label}`"
      :title="label"
      @click="pinned = true"
    >
      <span>{{ label }}</span>
    </button>

    <section v-else class="hud-panel" :aria-label="label">
      <header class="hud-panel-head">
        <span class="hud-title">{{ label }}</span>
        <button
          v-if="autoFolded"
          type="button"
          class="hud-fold"
          :aria-label="`Fold ${label}`"
          title="Fold"
          @click="pinned = false"
        >
          ×
        </button>
      </header>
      <slot />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useHudFold } from '@/composables/useHudFold'

export type HudPlacement = 'tl' | 'tc' | 'tr' | 'bl' | 'br'

const props = withDefaults(defineProps<{
  /** Micro-label shown in the panel header and on the folded edge tab. */
  label: string
  /** Viewport corner/edge the block floats at. */
  placement: HudPlacement
  /** Auto-fold order: lower folds earlier as the viewport shrinks. */
  foldPriority?: number
}>(), {
  foldPriority: 2,
})

const autoFolded = useHudFold(props.foldPriority)
const pinned = ref(false)

watch(autoFolded, (folded) => {
  if (!folded) pinned.value = false
})

const isFolded = computed(() => autoFolded.value && !pinned.value)
</script>

<style scoped>
.hud-block {
  position: absolute;
  z-index: 100;
  font-family: var(--galavi-font-mono);
  font-size: var(--galavi-font-size);
  color: var(--galavi-text);
}
.hud-tl { top: 12px; left: 12px; }
.hud-tc { top: 12px; left: 50%; transform: translateX(-50%); }
.hud-tr { top: 12px; right: 12px; }
.hud-bl { bottom: 12px; left: 12px; }
.hud-br { bottom: 12px; right: 12px; }

/* Folded tabs dock to the viewport edge. */
.hud-block.folded.hud-tl,
.hud-block.folded.hud-bl { left: 0; }
.hud-block.folded.hud-tr,
.hud-block.folded.hud-br { right: 0; }

.hud-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--galavi-border);
  border-radius: 2px;
  background: var(--galavi-panel-bg);
  backdrop-filter: blur(8px);
  box-shadow: 0 0 12px var(--galavi-accent-soft);
}

.hud-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.hud-title {
  color: var(--galavi-text-dim);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hud-fold {
  padding: 0 2px;
  border: 0;
  background: transparent;
  color: var(--galavi-text-dim);
  font: inherit;
  line-height: 1;
  cursor: pointer;
}
.hud-fold:hover { color: var(--galavi-accent); }

.hud-tab {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 5px;
  border: 1px solid var(--galavi-border);
  background: var(--galavi-panel-bg);
  backdrop-filter: blur(8px);
  color: var(--galavi-text-dim);
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
}
.hud-tab span { writing-mode: vertical-rl; }
.hud-tc .hud-tab span { writing-mode: horizontal-tb; }
.hud-tl .hud-tab,
.hud-bl .hud-tab { border-radius: 0 2px 2px 0; }
.hud-tr .hud-tab,
.hud-br .hud-tab { border-radius: 2px 0 0 2px; }
.hud-tc .hud-tab { border-radius: 0 0 2px 2px; }
.hud-tab:hover {
  color: var(--galavi-accent);
  box-shadow: 0 0 10px var(--galavi-accent-soft);
}
</style>

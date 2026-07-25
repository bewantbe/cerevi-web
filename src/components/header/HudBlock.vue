<template>
  <div
    class="hud-block"
    :class="[`hud-${resolvedSide}`, `hud-${resolvedPosition}`, { folded: !open, open }]"
    @mouseenter="onMouseEnter"
    @mouseleave="onMouseLeave"
  >
    <button
      type="button"
      class="hud-tab"
      :aria-label="`${open ? 'Collapse' : 'Expand'} ${label}`"
      :aria-expanded="open"
      :title="label"
      @click="open = !open"
    >
      <slot name="tab" :open="open">
        <span class="hud-tab-label">{{ label }}</span>
      </slot>
    </button>

    <Transition name="hud-panel">
      <section v-if="mounted" v-show="open" class="hud-panel" :aria-label="label">
        <header v-if="showHeader" class="hud-panel-head">
          <span class="hud-title">{{ label }}</span>
        </header>
        <div class="hud-panel-body">
          <slot />
        </div>
      </section>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useHudFold } from '@/composables/useHudFold'

export type HudPlacement = 'tl' | 'tc' | 'tr' | 'bl' | 'br'
export type HudSide = 'left' | 'right'
export type HudPosition = 'top' | 'second' | 'middle' | 'lower' | 'bottom'

/** Delay before a hover-opened panel closes, so brief pointer gaps (tab → panel) don't flicker it shut. */
const HOVER_CLOSE_DELAY_MS = 150
const hoverCapable = typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(hover: hover)').matches

const props = withDefaults(defineProps<{
  label: string
  placement?: HudPlacement
  side?: HudSide
  position?: HudPosition
  foldPriority?: number
  defaultOpen?: boolean
  stateKey?: string
  showHeader?: boolean
  toggleOnHover?: boolean
}>(), {
  placement: 'tl',
  foldPriority: 2,
  defaultOpen: true,
  stateKey: '',
  showHeader: true,
  toggleOnHover: false,
})

const autoFolded = useHudFold(props.foldPriority)
const open = ref(props.defaultOpen && !autoFolded.value)
// Panel content mounts lazily on first open, then stays mounted (v-show) so
// canvases and other stateful children survive close/reopen cycles.
const mounted = ref(open.value)
let hoverCloseTimer: ReturnType<typeof setTimeout> | undefined

const resolvedSide = computed<HudSide>(() => {
  if (props.side) return props.side
  return props.placement === 'tr' || props.placement === 'br' ? 'right' : 'left'
})

const resolvedPosition = computed<HudPosition>(() => {
  if (props.position) return props.position
  if (props.placement === 'bl' || props.placement === 'br') return 'bottom'
  return 'top'
})

function onMouseEnter() {
  if (!props.toggleOnHover || !hoverCapable) return
  clearTimeout(hoverCloseTimer)
  open.value = true
}

function onMouseLeave() {
  if (!props.toggleOnHover || !hoverCapable) return
  clearTimeout(hoverCloseTimer)
  hoverCloseTimer = setTimeout(() => {
    open.value = false
  }, HOVER_CLOSE_DELAY_MS)
}

watch(open, (isOpen) => {
  if (isOpen) mounted.value = true
})

watch(
  () => [props.defaultOpen, autoFolded.value, props.stateKey] as const,
  ([defaultOpen, folded]) => {
    open.value = defaultOpen && !folded
  },
)

onBeforeUnmount(() => clearTimeout(hoverCloseTimer))
</script>

<style scoped>
.hud-block {
  position: absolute;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  font-family: var(--galavi-font-mono);
  font-size: var(--galavi-font-size);
  color: var(--galavi-text);
  pointer-events: none;
}
.hud-left { left: 0; }
.hud-right { right: 0; }
/* Slot offsets share the shell's --edge margin (30px; fallback keeps the
   block usable outside a .viewer-shell). */
.hud-top { top: var(--edge, 30px); }
/* top edge + one tab height (76px) + 8px gap */
.hud-second { top: calc(var(--edge, 30px) + 84px); }
.hud-middle { top: 50%; transform: translateY(-50%); }
.hud-lower { bottom: calc(var(--edge, 30px) + 80px); }
.hud-bottom { bottom: var(--edge, 30px); }
/* Bottom-anchored blocks keep the tab pinned at the bottom when the panel
   opens: the panel rises above it instead of dragging the tab up. */
.hud-lower, .hud-bottom { align-items: flex-end; }
.hud-left .hud-tab { order: 0; }
.hud-left .hud-panel { order: 1; }
.hud-right .hud-panel { order: 0; }
.hud-right .hud-tab { order: 1; }

.hud-panel {
  position: relative;
  display: flex;
  min-width: 180px;
  max-width: min(320px, calc(100vw - 44px));
  max-height: calc(100vh - 96px);
  flex-direction: column;
  border: 1px solid var(--galavi-border);
  background:
    linear-gradient(135deg, var(--galavi-accent-soft), transparent 34%),
    var(--galavi-panel-bg);
  backdrop-filter: blur(18px) saturate(130%);
  box-shadow: 0 0 18px var(--galavi-accent-soft), var(--shadow-lg);
  clip-path: polygon(0 8px, 8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px));
  pointer-events: auto;
}

.hud-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px 7px;
  border-bottom: 1px solid var(--galavi-border);
}

.hud-title {
  color: var(--galavi-accent);
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
}

.hud-panel-body {
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
}

.hud-tab {
  display: flex;
  /* Tab width matches the shell's --edge margin so folded tabs sit in it. */
  width: var(--edge, 30px);
  min-height: 76px;
  align-items: center;
  justify-content: center;
  flex: 0 0 var(--edge, 30px);
  padding: 9px 6px;
  border: 1px solid var(--galavi-border);
  background:
    linear-gradient(180deg, var(--galavi-accent-soft), transparent),
    var(--galavi-panel-bg);
  backdrop-filter: blur(18px) saturate(130%);
  color: var(--galavi-text-dim);
  font: inherit;
  font-size: 10px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  cursor: pointer;
  pointer-events: auto;
  transition: color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}
.hud-tab-label { writing-mode: vertical-rl; }
.hud-left .hud-tab {
  border-left: 0;
  clip-path: polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%);
}
.hud-right .hud-tab {
  border-right: 0;
  clip-path: polygon(7px 0, 100% 0, 100% 100%, 7px 100%, 0 calc(100% - 7px), 0 7px);
}
.hud-tab:hover {
  color: var(--galavi-accent);
  box-shadow: 0 0 10px var(--galavi-accent-soft);
}
.hud-block.open .hud-tab {
  background: var(--galavi-accent-soft);
  color: var(--galavi-accent);
}

.hud-panel-enter-active,
.hud-panel-leave-active {
  transition: opacity 180ms ease, transform 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.hud-panel-enter-from,
.hud-panel-leave-to { opacity: 0; }
.hud-left .hud-panel-enter-from,
.hud-left .hud-panel-leave-to { transform: translateX(-12px); }
.hud-right .hud-panel-enter-from,
.hud-right .hud-panel-leave-to { transform: translateX(12px); }

@media (prefers-reduced-motion: reduce) {
  .hud-panel-enter-active,
  .hud-panel-leave-active,
  .hud-tab { transition: none; }
}
</style>

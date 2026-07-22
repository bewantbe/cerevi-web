import { computed, ref, type Ref } from 'vue'

/** The first block folds below this viewport width; each further priority step folds one block earlier. */
export const HUD_FOLD_BASE_PX = 1100
export const HUD_FOLD_STEP_PX = 110

const viewportWidth = ref(typeof window === 'undefined' ? HUD_FOLD_BASE_PX : window.innerWidth)
let listenerAttached = false

function attachResizeListener() {
  if (listenerAttached || typeof window === 'undefined') return
  listenerAttached = true
  window.addEventListener('resize', () => {
    viewportWidth.value = window.innerWidth
  }, { passive: true })
}

/**
 * Shared auto-fold state for the header HUD blocks. Lower `priority` folds
 * earlier as the viewport shrinks (readout = 0 folds first, toolbox = 4 last).
 */
export function useHudFold(priority: number): Ref<boolean> {
  attachResizeListener()
  const threshold = HUD_FOLD_BASE_PX - priority * HUD_FOLD_STEP_PX
  return computed(() => viewportWidth.value < threshold)
}

<template>
  <HudBlock
    v-if="store.mode === 'slice'"
    class="slice-views-block"
    label="Views"
    side="left"
    position="middle"
    :default-open="true"
    :fold-priority="9"
    :show-header="false"
  >
    <!-- SliceMode teleports its other-plane thumbnails here. Kept mounted by
         HudBlock after first open so the thumbnail canvases survive folds. -->
    <div id="views-block-body" class="views-block-body"></div>
  </HudBlock>
</template>

<script setup lang="ts">
import { useCereviStore } from '@/stores/visor'
import HudBlock from '@/components/header/HudBlock.vue'

const store = useCereviStore()
</script>

<style scoped>
.slice-views-block {
  top: 0;
  bottom: 0;
  width: var(--edge, 30px);
  height: auto;
  transform: none;
}
.slice-views-block :deep(.hud-panel) {
  position: absolute;
  bottom: calc(var(--lower-panel-baseline, 106px) + var(--readout-panel-height, 76px) + 20px);
  left: var(--edge, 30px);
  width: var(--left-panel-width, 290px);
  max-width: var(--left-panel-width, 290px);
  height: min(558px, calc(100vh - var(--lower-panel-baseline, 106px) - var(--readout-panel-height, 76px) - var(--edge, 30px) - 20px));
}
.slice-views-block :deep(.hud-tab) {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
}
</style>

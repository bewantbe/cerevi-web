<template>
  <div class="foldable" :class="[side, { open }]" :style="{ top: top + 'px', bottom: bottom + 'px' }">
    <!-- Edge hover bar (visible when closed) -->
    <div v-show="!open" class="edge-zone" @click="setOpen(true)">
      <div class="edge-bar" :title="`Show ${label}`">
        <el-icon :size="16">
          <component :is="side === 'right' ? ArrowLeftBold : ArrowRightBold" />
        </el-icon>
      </div>
    </div>

    <!-- Panel (visible when open) -->
    <transition :name="side === 'right' ? 'slide-right' : 'slide-left'">
      <aside v-show="open" class="panel" :style="{ width: width + 'px' }">
        <div class="close-zone" @click="setOpen(false)">
          <div class="close-bar" :title="`Hide ${label}`">
            <el-icon :size="16">
              <component :is="side === 'right' ? ArrowRightBold : ArrowLeftBold" />
            </el-icon>
          </div>
        </div>
        <div class="panel-inner">
          <slot />
        </div>
      </aside>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ArrowLeftBold, ArrowRightBold } from '@element-plus/icons-vue'

withDefaults(
  defineProps<{
    side: 'left' | 'right'
    open: boolean
    width?: number
    label?: string
    top?: number
    bottom?: number
  }>(),
  { width: 300, label: 'panel', top: 0, bottom: 0 },
)

const emit = defineEmits<{ 'update:open': [value: boolean] }>()

function setOpen(value: boolean) {
  emit('update:open', value)
}
</script>

<style scoped>
.foldable {
  position: absolute;
  top: 0;
  bottom: 0;
  z-index: 40;
  pointer-events: none;
}
.foldable.right { right: 0; }
.foldable.left  { left: 0; }

/* Edge hover zone */
.edge-zone {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 18px;
  pointer-events: auto;
  cursor: pointer;
}
.foldable.right .edge-zone { right: 0; }
.foldable.left  .edge-zone { left: 0; }

.edge-bar {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-on-accent);
  background: var(--c-accent);
  opacity: 0;
  transition: opacity 0.16s ease;
  box-shadow: var(--shadow-md);
}
.foldable.right .edge-bar { right: 0; border-radius: var(--radius-md) 0 0 var(--radius-md); }
.foldable.left  .edge-bar { left: 0;  border-radius: 0 var(--radius-md) var(--radius-md) 0; }
.edge-zone:hover .edge-bar { opacity: 0.95; }

/* Panel */
.panel {
  position: absolute;
  top: 0;
  bottom: 0;
  background: transparent;
  backdrop-filter: none;
  border-left: 1px solid transparent;
  border-right: 1px solid transparent;
  box-shadow: none;
  pointer-events: auto;
  display: flex;
}
.foldable.right .panel { right: 0; flex-direction: row; }
.foldable.left  .panel { left: 0;  flex-direction: row-reverse; }

.close-zone {
  flex: 0 0 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.close-bar {
  width: 18px;
  height: 64px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--c-text-muted);
  background: var(--c-bg-elev);
  border-radius: var(--radius-sm);
  opacity: 0.4;
  transition: opacity 0.16s ease, color 0.16s ease;
}
.close-zone:hover .close-bar { opacity: 1; color: var(--c-accent); }

.panel-inner {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 14px 14px 18px;
  background: transparent;
}

.slide-right-enter-active,
.slide-right-leave-active,
.slide-left-enter-active,
.slide-left-leave-active {
  transition: transform 0.22s ease;
}
.slide-right-enter-from,
.slide-right-leave-to { transform: translateX(100%); }
.slide-left-enter-from,
.slide-left-leave-to  { transform: translateX(-100%); }
</style>

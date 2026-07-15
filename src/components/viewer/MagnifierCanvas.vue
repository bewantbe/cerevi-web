<template>
  <div v-show="visible" class="magnifier" :style="magnifierStyle">
    <canvas ref="canvas" class="magnifier-canvas"></canvas>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps<{ visible: boolean; x: number; y: number }>()
const emit = defineEmits<{ ready: [canvas: HTMLCanvasElement]; resize: [size: number] }>()
const canvas = ref<HTMLCanvasElement | null>(null)
const size = ref(180)
let resizeObserver: ResizeObserver | undefined

const magnifierStyle = computed(() => ({
  left: `${props.x}px`,
  top: `${props.y}px`,
  width: `${size.value}px`,
  height: `${size.value}px`,
}))

function measure() {
  const host = canvas.value?.parentElement?.parentElement
  if (!host) return
  const next = Math.round(Math.max(140, Math.min(320, Math.min(host.clientWidth, host.clientHeight) / 4)))
  if (next === size.value) return
  size.value = next
  emit('resize', next)
}

onMounted(() => {
  if (canvas.value) emit('ready', canvas.value)
  measure()
  const host = canvas.value?.parentElement?.parentElement
  resizeObserver = new ResizeObserver(measure)
  if (host) resizeObserver.observe(host)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
</script>

<style scoped>
.magnifier { position: absolute; z-index: 45; transform: translate(-50%, -50%); overflow: hidden; border: 2px solid var(--c-accent); border-radius: var(--radius-sm); background: #000; box-shadow: 0 12px 34px rgba(0, 0, 0, 0.42); pointer-events: none; }
.magnifier-canvas { display: block; width: 100%; height: 100%; }
</style>
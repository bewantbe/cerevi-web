<template>
  <div class="hud-field">
    <span class="hud-field-label">{{ label }}</span>
    <span class="hud-field-value">{{ display }}<span class="tw-caret" :class="{ typing }" aria-hidden="true"></span></span>
  </div>
</template>

<script setup lang="ts">
import { useTypewriter } from '@/composables/useTypewriter'

const props = defineProps<{
  label: string
  value: string
}>()

const { display, typing } = useTypewriter(() => props.value)
</script>

<style scoped>
.hud-field {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
}
.hud-field-label {
  flex: 0 0 auto;
  color: var(--galavi-text-dim);
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.hud-field-value {
  color: var(--galavi-text);
  font-family: var(--galavi-font-mono);
  font-size: var(--galavi-font-size);
  text-align: right;
  white-space: nowrap;
}
.tw-caret {
  display: inline-block;
  width: 0.55em;
  height: 1em;
  margin-left: 2px;
  vertical-align: -0.15em;
  background: var(--galavi-accent);
  opacity: 0.85;
  animation: tw-blink 1.06s steps(1) infinite;
}
.tw-caret.typing {
  animation: none;
  opacity: 1;
}
@keyframes tw-blink {
  50% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .tw-caret { animation: none; }
}
</style>

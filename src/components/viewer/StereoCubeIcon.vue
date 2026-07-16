<template>
  <svg class="stereo-cube" viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    <!-- Stereoscopic "ghost" cube offset slightly for a 3D anaglyph effect -->
    <g class="stereo-ghost" stroke="var(--c-accent)" opacity="0.55">
      <path d="M12 4.5l7.5 4.25v8.5L12 21.5l-7.5-4.25v-8.5L12 4.5z" />
      <path d="M12 12.75l7.5-4M12 12.75V4.5M12 12.75l-7.5-4" />
    </g>
    <!-- Main wireframe cube -->
    <g stroke="currentColor">
      <path d="M12 3l7.5 4.25v8.5L12 20l-7.5-4.25v-8.5L12 3z" />
      <path d="M12 11.25l7.5-4M12 11.25V3M12 11.25l-7.5-4" />
    </g>
  </svg>
</template>

<style scoped>
.stereo-cube {
  width: 1em;
  height: 1em;
  display: block;
}
.stereo-ghost {
  transform: translate(-1.5px, -1px);
}
</style>

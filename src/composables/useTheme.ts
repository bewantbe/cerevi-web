import { ref } from 'vue'

export type Theme = 'dark' | 'light'

const theme = ref<Theme>('dark')
let initialized = false

function apply(t: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', t)
}

function initializeTheme() {
  if (initialized) return
  initialized = true
  theme.value = 'dark'
  apply('dark')
}

export function useTheme() {
  initializeTheme()

  return {
    theme,
  }
}

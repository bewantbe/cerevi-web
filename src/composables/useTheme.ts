import { ref, watchEffect } from 'vue'

export type Theme = 'dark' | 'light'

const STORAGE_KEY = 'cerevi.theme'
const theme = ref<Theme>(readInitialTheme())

function readInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark'
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return 'dark' // dark is the default
}

function apply(t: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', t)
}

watchEffect(() => {
  apply(theme.value)
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, theme.value)
  }
})

export function useTheme() {
  return {
    theme,
    setTheme(t: Theme) {
      theme.value = t
    },
    toggleTheme() {
      theme.value = theme.value === 'dark' ? 'light' : 'dark'
    },
  }
}

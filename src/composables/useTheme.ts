import { applyThemeTo, FUI_THEME, type GalaviTheme } from 'galavi'

let initialized = false

/** Cerevi ships with galavi's FUI theme only. */
export function getGalaviTheme(): GalaviTheme {
  return FUI_THEME
}

function applyFuiTheme() {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', 'fui')
  applyThemeTo(document.documentElement, FUI_THEME)
}

/** Applies the FUI theme to the document once; safe to call from any component. */
export function useTheme() {
  if (initialized) return
  initialized = true
  applyFuiTheme()
}

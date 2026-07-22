import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export interface TypewriterOptions {
  /** Milliseconds between characters. */
  interval?: number
}

/**
 * Terminal-style auto-typing for HUD field values: reveals the watched string
 * char-by-char and re-runs whenever it changes (e.g. on specimen switch).
 * Components render `display` plus a blinking block caret (`typing` marks the
 * in-progress state). With `prefers-reduced-motion: reduce` the value renders
 * instantly instead.
 */
export function useTypewriter(source: MaybeRefOrGetter<string>, options: TypewriterOptions = {}) {
  const interval = options.interval ?? 16
  const display = ref('')
  const typing = ref(false)
  let timer: number | undefined

  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function stop() {
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  function run(text: string) {
    stop()
    if (reducedMotion || !text) {
      display.value = text
      typing.value = false
      return
    }
    display.value = ''
    typing.value = true
    let index = 0
    timer = window.setInterval(() => {
      index += 1
      display.value = text.slice(0, index)
      if (index >= text.length) {
        stop()
        typing.value = false
      }
    }, interval)
  }

  watch(() => toValue(source), run, { immediate: true })
  onBeforeUnmount(stop)

  return { display, typing }
}

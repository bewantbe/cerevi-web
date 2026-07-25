import { onBeforeUnmount, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'

export interface TypewriterOptions {
  /** Milliseconds between characters. */
  interval?: number
  /** Milliseconds before typing begins. */
  delay?: number
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
  const delay = options.delay ?? 0
  const display = ref('')
  const typing = ref(false)
  let timer: number | undefined
  let delayTimer: number | undefined

  const reducedMotion = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches

  function stop() {
    if (delayTimer !== undefined) {
      window.clearTimeout(delayTimer)
      delayTimer = undefined
    }
    if (timer !== undefined) {
      window.clearInterval(timer)
      timer = undefined
    }
  }

  function type(text: string) {
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

  function run(text: string) {
    stop()
    if (reducedMotion || !text) {
      display.value = text
      typing.value = false
      return
    }
    display.value = ''
    typing.value = delay === 0
    if (delay > 0) {
      delayTimer = window.setTimeout(() => {
        delayTimer = undefined
        type(text)
      }, delay)
    } else type(text)
  }

  watch(() => toValue(source), run, { immediate: true })
  onBeforeUnmount(stop)

  return { display, typing }
}

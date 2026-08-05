// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import HudBlock from '@/components/header/HudBlock.vue'
import { TOOL_NAMES, useCereviStore } from '@/stores/visor'

describe('mode switch state', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('disables every active tool when the mode changes', () => {
    const store = useCereviStore()
    store.setMode('quadrant')
    for (const tool of TOOL_NAMES) store.toggleTool(tool)

    expect(TOOL_NAMES.every((tool) => store.enabledTools[tool])).toBe(true)

    store.setMode('slice')

    expect(TOOL_NAMES.every((tool) => !store.enabledTools[tool])).toBe(true)
  })

  it('keeps magnifier variants mutually exclusive and clears a disabled pin', () => {
    const store = useCereviStore()
    store.setMode('slice')

    store.cycleMagnifierMode()
    expect(store.magnifierMode).toBe('2d')
    expect(store.enabledTools.magnifier).toBe(true)

    store.cycleMagnifierMode()
    store.pinMagnifier3d([10, 20, 30], 'xy')
    expect(store.magnifierMode).toBe('3d')
    expect(store.magnifier3dPosition).toEqual([10, 20, 30])
    expect(store.magnifier3dPlane).toBe('xy')

    store.cycleMagnifierMode()
    expect(store.magnifierMode).toBeNull()
    expect(store.enabledTools.magnifier).toBe(false)
    expect(store.magnifier3dPosition).toBeNull()
    expect(store.magnifier3dPlane).toBeNull()
  })

  it('resets a HUD block between non-volume modes and opens it in volume mode', async () => {
    const wrapper = mount(HudBlock, {
      props: {
        label: 'Channel',
        defaultOpen: false,
        stateKey: 'quadrant',
      },
    })
    const toggle = wrapper.get('button')
    await toggle.trigger('click')
    expect(toggle.attributes('aria-expanded')).toBe('true')

    await wrapper.setProps({ stateKey: 'slice' })
    expect(toggle.attributes('aria-expanded')).toBe('false')

    await wrapper.setProps({ defaultOpen: true, stateKey: 'volume' })
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })
})
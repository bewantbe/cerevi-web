// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import { bootstrap, type SetupContext } from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'
import GridMode from '@/components/viewer/modes/GridMode.vue'
import VolumeMode from '@/components/viewer/modes/VolumeMode.vue'
import SliceNavigator from '@/components/viewer/SliceNavigator.vue'

vi.mock('@/galavi-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/galavi-setup')>()
  return {
    ...actual,
    bootstrap: vi.fn(),
  }
})

const mockBootstrap = vi.mocked(bootstrap)

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Same minimal SetupContext shape as visor-select.test.ts.
function makeContext(specimenId: string): SetupContext & { dispose: ReturnType<typeof vi.fn> } {
  const level = (shape: Vec3, scale: Vec3) => ({
    levels: [{ path: '0', shape, chunkSize: shape, scale }],
  })
  return {
    specimenId,
    dataset: {
      physical: { spatial: { size: [10, 20, 30], unit: 'μm', origin: [0, 0, 0] } },
    },
    sliceDefs: {
      xy: { axisMap: [0, 2, 1], sourcePlane: 'xz' },
      xz: { axisMap: [0, 1, 2], sourcePlane: 'xy' },
      yz: { axisMap: [1, 2, 0], sourcePlane: 'yz' },
    },
    sliceSources: {
      xy: { info: { origin: [0, 0, 0] }, pyramid: level([10, 20, 30], [1, 1, 1]) },
      xz: { info: { origin: [0, 0, 0] }, pyramid: level([10, 20, 30], [1, 1, 1]) },
      yz: { info: { origin: [0, 0, 0] }, pyramid: level([10, 20, 30], [1, 1, 1]) },
    },
    imageryContrastLimits: { volume: [[0, 1]], xy: [[0, 1]], xz: [[0, 1]], yz: [[0, 1]] },
    initCh: 0,
    channelCount: 1,
    channels: [{ index: 0, label: 'C0', color: '#FFFFFF' }],
    dispose: vi.fn(),
  } as unknown as SetupContext & { dispose: ReturnType<typeof vi.fn> }
}

describe('mode build failure UI', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('VolumeMode replaces the loading state with the build error', async () => {
    mockBootstrap.mockRejectedValueOnce(new Error('WebGPU not supported'))
    const wrapper = mount(VolumeMode, { props: { ctx: makeContext('a') } })
    expect(wrapper.text()).toContain('Preparing volume...')

    await flushPromises()

    expect(wrapper.text()).toContain('WebGPU not supported')
    expect(wrapper.text()).not.toContain('Preparing volume...')
    wrapper.unmount()
  })

  it('GridMode shows the build error when there is no previous engine', async () => {
    // Real buildGrid path: jsdom has no WebGPU, so the GPU init rejects.
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    await flushPromises()

    const overlay = wrapper.find('.mode-error')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text().length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('SliceNavigator shows the build error when there is no previous engine', async () => {
    const store = useCereviStore()
    store.setupCtx = makeContext('a')
    const wrapper = mount(SliceNavigator, {
      props: { plane: 'xy', slice: 0, max: 10, open: true },
    })
    await flushPromises()

    const overlay = wrapper.find('.nav-error')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text().length).toBeGreaterThan(0)
    wrapper.unmount()
  })
})

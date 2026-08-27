// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import { bootstrap } from '@/galavi/view-factories'
import type { CereviDataset } from '@/galavi/specimen-dataset'
import { useCereviStore } from '@/stores/visor'
import GridMode from '@/components/viewer/modes/GridMode.vue'
import VolumeMode from '@/components/viewer/modes/VolumeMode.vue'
import SliceNavigator from '@/components/viewer/SliceNavigator.vue'

vi.mock('@/galavi/view-factories', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/galavi/view-factories')>()
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

// Same minimal CereviDataset shape as visor-select.test.ts: slice orientations
// plus the named plane/volume resources the builders read.
function makeContext(specimenId: string): CereviDataset & { dispose: ReturnType<typeof vi.fn> } {
  const level = (shape: Vec3, scale: Vec3) => ({
    levels: [{ path: '0', shape, chunkSize: shape, scale }],
  })
  const channel = { index: 0, label: 'C0', color: '#FFFFFF', contrast: [0, 1], visible: true }
  const planeResource = (plane: 'xy' | 'xz' | 'yz') => ({
    id: `plane-${plane}`,
    kind: 'image-pyramid',
    pyramid: level([10, 20, 30], [1, 1, 1]),
    fetch: () => Promise.resolve(new ArrayBuffer(0)),
    dimensions: [{ name: 'c', size: 1 }],
    defaultSelection: {},
    channels: [channel],
    axisMap: [0, 1, 2],
    info: { origin: [0, 0, 0], defaultSelection: {} },
  })
  const volumeImage = {
    id: 'volume',
    kind: 'image-pyramid',
    pyramid: level([10, 20, 30], [1, 1, 1]),
    fetch: () => Promise.resolve(new ArrayBuffer(0)),
    dimensions: [{ name: 'c', size: 1 }],
    defaultSelection: { c: 0 },
    channels: [channel],
  }
  return {
    type: 'cerevi-specimen',
    specimenId,
    physical: { spatial: { size: [10, 20, 30], unit: 'μm', origin: [0, 0, 0] } },
    channels: [channel],
    defaultSelection: { c: 0 },
    sliceOrientations: {
      xy: { axes: ['x', 'z'], axisMap: [0, 2, 1], sourcePlane: 'xz', reversed: [false, false, false] },
      xz: { axes: ['x', 'y'], axisMap: [0, 1, 2], sourcePlane: 'xy', reversed: [false, false, false] },
      yz: { axes: ['y', 'z'], axisMap: [1, 2, 0], sourcePlane: 'yz', reversed: [false, false, false] },
    },
    storageReversed: [false, false, false],
    volumeResource: () => volumeImage,
    planeResource,
    meshResource: () => undefined,
    dispose: vi.fn(),
  } as unknown as CereviDataset & { dispose: ReturnType<typeof vi.fn> }
}

describe('mode build failure UI', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
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

  it('GridMode shows the build error when there is no previous runtime', async () => {
    // Real createSliceGrid path: a sized viewport yields a 15-slot pool, and
    // jsdom has no WebGPU, so the controller's GPU init rejects.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, value: 800 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, value: 600 })
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    await flushPromises()

    const overlay = wrapper.find('.mode-error')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text().length).toBeGreaterThan(0)
    wrapper.unmount()
  })

  it('SliceNavigator shows the build error when there is no previous runtime', async () => {
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

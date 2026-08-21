// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import { createViewerEngine, type ViewerEngine } from 'galavi/advanced'
import type { SetupContext } from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'
import SliceMode from '@/components/viewer/modes/SliceMode.vue'

vi.mock('galavi/advanced', async (importOriginal) => {
  const actual = await importOriginal<typeof import('galavi/advanced')>()
  return {
    ...actual,
    createViewerEngine: vi.fn(),
  }
})

const mockCreateViewerEngine = vi.mocked(createViewerEngine)

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Minimal SetupContext shape: visor-select.test.ts's fake plus the SliceDef
// fields (key/axes/reversed/layerId...) and storageReversed that the real
// layer/view factories read while bootstrap assembles the engine config.
function makeContext(specimenId: string): SetupContext & { dispose: ReturnType<typeof vi.fn> } {
  const level = (shape: Vec3, scale: Vec3) => ({
    levels: [{ path: '0', shape, chunkSize: shape, scale }],
  })
  const def = (
    key: 'xy' | 'xz' | 'yz',
    axisMap: Vec3,
    sourcePlane: 'xy' | 'xz' | 'yz',
  ) => ({
    key,
    axes: ['sagittal', 'dorsal'],
    axisMap,
    sourcePlane,
    reversed: [false, false, false],
    layerId: `slice${key.toUpperCase()}`,
    regionShapesId: `regionShapes${key.toUpperCase()}`,
    anatomicalLabel: key,
  })
  return {
    specimenId,
    dataset: {
      physical: { spatial: { size: [10, 20, 30], unit: 'μm', origin: [0, 0, 0] } },
    },
    sliceDefs: {
      xy: def('xy', [0, 2, 1], 'xz'),
      xz: def('xz', [0, 1, 2], 'xy'),
      yz: def('yz', [1, 2, 0], 'yz'),
    },
    storageReversed: [false, false, false],
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

function fakeEngine() {
  const view = { setOverlayOptions: vi.fn(), getResolution: vi.fn() }
  return {
    initGPU: vi.fn().mockResolvedValue(undefined),
    mountAll: vi.fn().mockResolvedValue(undefined),
    mount: vi.fn().mockResolvedValue(undefined),
    setActiveView: vi.fn(),
    setTarget: vi.fn(),
    subscribe: vi.fn(() => () => {}),
    getState: vi.fn(() => ({
      physical: { spatial: { size: [10, 20, 30], unit: 'μm' } },
      layers: [],
      exploration: {
        camera: { navMode: 'fly', projMode: 'orthographic', position: [0, 0, 10], target: [0, 0, 0] },
      },
    })),
    view: vi.fn(() => view),
    updateLayers: vi.fn(),
    requestRender: vi.fn(),
    destroy: vi.fn(),
  } as unknown as ViewerEngine & {
    initGPU: ReturnType<typeof vi.fn>
    mountAll: ReturnType<typeof vi.fn>
    mount: ReturnType<typeof vi.fn>
    setActiveView: ReturnType<typeof vi.fn>
    destroy: ReturnType<typeof vi.fn>
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function mountSliceMode() {
  // SliceMode Teleports its thumbnail panel into ViewsBlock's body — provide
  // the target like ViewerShell does.
  const target = document.createElement('div')
  target.id = 'views-block-body'
  document.body.appendChild(target)
  const wrapper = mount(SliceMode, {
    props: { ctx: makeContext('a') },
    attachTo: document.body,
  })
  return { wrapper, target }
}

describe('SliceMode rebuild lifetime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    vi.spyOn(console, 'error').mockImplementation(() => {})
    useCereviStore().setMode('slice')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('shows the build error when the initial session build fails', async () => {
    mockCreateViewerEngine.mockRejectedValueOnce(new Error('WebGPU not supported'))
    const { wrapper } = mountSliceMode()
    await flushPromises()

    const overlay = wrapper.find('.mode-error')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text()).toContain('WebGPU not supported')
    expect(wrapper.text()).not.toContain('Preparing slice gallery...')
    wrapper.unmount()
  })

  it('builds off-canvas and mounts the three slice views only after a successful build', async () => {
    const first = fakeEngine()
    mockCreateViewerEngine.mockResolvedValueOnce(first)
    const { wrapper } = mountSliceMode()
    await flushPromises()

    expect(first.initGPU).toHaveBeenCalledTimes(1)
    expect(first.mountAll).toHaveBeenCalledTimes(1)
    const buildOrder = first.initGPU.mock.invocationCallOrder[0]
    const mountOrder = first.mountAll.mock.invocationCallOrder[0]
    expect(buildOrder).toBeLessThan(mountOrder)
    // Main gallery + both thumbnails, keyed by slice-plane view id.
    expect(Object.keys(first.mountAll.mock.calls[0][0]).sort()).toEqual(['xy', 'xz', 'yz'])
    expect(first.setActiveView).toHaveBeenCalledWith('xy')
    expect(first.destroy).not.toHaveBeenCalled()
    expect(wrapper.find('.mode-error').exists()).toBe(false)
    wrapper.unmount()
    expect(first.destroy).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous engine when a rebuild fails', async () => {
    const store = useCereviStore()
    const first = fakeEngine()
    mockCreateViewerEngine.mockResolvedValueOnce(first)
    const { wrapper } = mountSliceMode()
    await flushPromises()
    expect(first.mountAll).toHaveBeenCalledTimes(1)

    // Force the plane-switch view swap to fail so it falls back to a rebuild,
    // then fail that rebuild.
    first.mount.mockRejectedValueOnce(new Error('canvas swap broke'))
    mockCreateViewerEngine.mockRejectedValueOnce(new Error('device lost'))
    store.setPlane('yz')
    await flushPromises()

    // The failed replacement never touches the live engine, and no error
    // overlay covers the still-working gallery.
    expect(first.destroy).not.toHaveBeenCalled()
    expect(wrapper.find('.mode-error').exists()).toBe(false)

    wrapper.unmount()
    expect(first.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys the old engine only after the replacement has built', async () => {
    const store = useCereviStore()
    const first = fakeEngine()
    const second = fakeEngine()
    mockCreateViewerEngine.mockResolvedValueOnce(first)
    const { wrapper } = mountSliceMode()
    await flushPromises()

    first.mount.mockRejectedValueOnce(new Error('canvas swap broke'))
    mockCreateViewerEngine.mockResolvedValueOnce(second)
    store.setPlane('yz')
    await flushPromises()

    expect(second.initGPU).toHaveBeenCalledTimes(1)
    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(second.mountAll).toHaveBeenCalledTimes(1)
    // Build before destroy, destroy before mount (shared canvas contexts).
    const buildOrder = second.initGPU.mock.invocationCallOrder[0]
    const destroyOrder = first.destroy.mock.invocationCallOrder[0]
    const mountOrder = second.mountAll.mock.invocationCallOrder[0]
    expect(buildOrder).toBeLessThan(destroyOrder)
    expect(destroyOrder).toBeLessThan(mountOrder)
    expect(second.setActiveView).toHaveBeenCalledWith('yz')
    expect(wrapper.find('.mode-error').exists()).toBe(false)

    wrapper.unmount()
    expect(second.destroy).toHaveBeenCalledTimes(1)
    expect(first.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys a superseded build result exactly once without mounting it', async () => {
    const slow = deferred<ViewerEngine>()
    const late = fakeEngine()
    mockCreateViewerEngine.mockReturnValueOnce(slow.promise)
    const { wrapper } = mountSliceMode()
    // Let the initial build reach its in-flight await...
    await flushPromises()
    expect(mockCreateViewerEngine).toHaveBeenCalledTimes(1)

    // ...then supersede it by unmounting (teardown bumps the build token).
    wrapper.unmount()
    slow.resolve(late)
    await flushPromises()

    expect(late.destroy).toHaveBeenCalledTimes(1)
    expect(late.mountAll).not.toHaveBeenCalled()
  })
})

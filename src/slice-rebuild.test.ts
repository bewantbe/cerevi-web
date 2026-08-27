// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import { createViewerRuntime, type ViewerRuntime } from 'galavi'
import type { CereviDataset } from '@/galavi/specimen-dataset'
import { useCereviStore } from '@/stores/visor'
import SliceMode from '@/components/viewer/modes/SliceMode.vue'

vi.mock('galavi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('galavi')>()
  return {
    ...actual,
    createViewerRuntime: vi.fn(),
  }
})

const mockCreateViewerRuntime = vi.mocked(createViewerRuntime)

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Minimal CereviDataset shape: visor-select.test.ts's fake — enough for the
// real layer/view factories to assemble the bootstrap runtime config (slice
// orientations, named plane/volume resources, physical framing, channels).
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
    // bootstrap builds the volume layer from the primary image resource.
    volumeResource: () => volumeImage,
    planeResource,
    meshResource: () => undefined,
    dispose: vi.fn(),
  } as unknown as CereviDataset & { dispose: ReturnType<typeof vi.fn> }
}

function fakeRuntime() {
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
  } as unknown as ViewerRuntime & {
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
    mockCreateViewerRuntime.mockRejectedValueOnce(new Error('WebGPU not supported'))
    const { wrapper } = mountSliceMode()
    await flushPromises()

    const overlay = wrapper.find('.mode-error')
    expect(overlay.exists()).toBe(true)
    expect(overlay.text()).toContain('WebGPU not supported')
    expect(wrapper.text()).not.toContain('Preparing slice gallery...')
    wrapper.unmount()
  })

  it('builds off-canvas and mounts the three slice views only after a successful build', async () => {
    const first = fakeRuntime()
    mockCreateViewerRuntime.mockResolvedValueOnce(first)
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

  it('keeps the previous runtime when a rebuild fails', async () => {
    const store = useCereviStore()
    const first = fakeRuntime()
    mockCreateViewerRuntime.mockResolvedValueOnce(first)
    const { wrapper } = mountSliceMode()
    await flushPromises()
    expect(first.mountAll).toHaveBeenCalledTimes(1)

    // Force the plane-switch view swap to fail so it falls back to a rebuild,
    // then fail that rebuild.
    first.mount.mockRejectedValueOnce(new Error('canvas swap broke'))
    mockCreateViewerRuntime.mockRejectedValueOnce(new Error('device lost'))
    store.setPlane('yz')
    await flushPromises()

    // The failed replacement never touches the live runtime, and no error
    // overlay covers the still-working gallery.
    expect(first.destroy).not.toHaveBeenCalled()
    expect(wrapper.find('.mode-error').exists()).toBe(false)

    wrapper.unmount()
    expect(first.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys the old runtime only after the replacement has built', async () => {
    const store = useCereviStore()
    const first = fakeRuntime()
    const second = fakeRuntime()
    mockCreateViewerRuntime.mockResolvedValueOnce(first)
    const { wrapper } = mountSliceMode()
    await flushPromises()

    first.mount.mockRejectedValueOnce(new Error('canvas swap broke'))
    mockCreateViewerRuntime.mockResolvedValueOnce(second)
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
    const slow = deferred<ViewerRuntime>()
    const late = fakeRuntime()
    mockCreateViewerRuntime.mockReturnValueOnce(slow.promise)
    const { wrapper } = mountSliceMode()
    // Let the initial build reach its in-flight await...
    await flushPromises()
    expect(mockCreateViewerRuntime).toHaveBeenCalledTimes(1)

    // ...then supersede it by unmounting (teardown bumps the build token).
    wrapper.unmount()
    slow.resolve(late)
    await flushPromises()

    expect(late.destroy).toHaveBeenCalledTimes(1)
    expect(late.mountAll).not.toHaveBeenCalled()
  })
})

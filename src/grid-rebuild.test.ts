// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import { createViewerEngine, type ViewerEngine } from 'galavi/advanced'
import type { SetupContext } from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'
import GridMode from '@/components/viewer/modes/GridMode.vue'

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

function fakeEngine() {
  return {
    initGPU: vi.fn().mockResolvedValue(undefined),
    mountAll: vi.fn().mockResolvedValue(undefined),
    updateLayers: vi.fn(),
    requestRender: vi.fn(),
    destroy: vi.fn(),
  } as unknown as ViewerEngine & {
    initGPU: ReturnType<typeof vi.fn>
    mountAll: ReturnType<typeof vi.fn>
    updateLayers: ReturnType<typeof vi.fn>
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

describe('GridMode rebuild lifetime', () => {
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

  it('keeps the previous engine when a rebuild fails', async () => {
    const store = useCereviStore()
    const first = fakeEngine()
    mockCreateViewerEngine.mockResolvedValueOnce(first)
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    await flushPromises()
    expect(first.initGPU).toHaveBeenCalledTimes(1)
    expect(first.mountAll).toHaveBeenCalledTimes(1)

    mockCreateViewerEngine.mockRejectedValueOnce(new Error('device lost'))
    store.setPlane('yz')
    await flushPromises()

    // The failed replacement never touches the live engine, and no error
    // overlay covers the still-working grid.
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
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    await flushPromises()

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
    expect(wrapper.find('.mode-error').exists()).toBe(false)

    wrapper.unmount()
    expect(second.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys a superseded build result exactly once without mounting it', async () => {
    const store = useCereviStore()
    const slow = deferred<ViewerEngine>()
    const late = fakeEngine()
    const current = fakeEngine()
    mockCreateViewerEngine.mockReturnValueOnce(slow.promise)
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    // Let the mount build reach its in-flight await...
    await flushPromises()
    expect(mockCreateViewerEngine).toHaveBeenCalledTimes(1)

    // ...then supersede it with a plane-switch rebuild.
    mockCreateViewerEngine.mockResolvedValueOnce(current)
    store.setPlane('yz')
    await flushPromises()
    expect(current.mountAll).toHaveBeenCalledTimes(1)

    slow.resolve(late)
    await flushPromises()

    expect(late.destroy).toHaveBeenCalledTimes(1)
    expect(late.mountAll).not.toHaveBeenCalled()
    expect(current.destroy).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(current.destroy).toHaveBeenCalledTimes(1)
    expect(late.destroy).toHaveBeenCalledTimes(1)
  })
})

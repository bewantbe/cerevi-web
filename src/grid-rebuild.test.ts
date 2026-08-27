// @vitest-environment jsdom

import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import {
  createSliceGrid,
  type CreateSliceGridOptions,
  type SliceGrid,
} from '@/galavi/slice-grid'
import type { CereviDataset } from '@/galavi/specimen-dataset'
import { useCereviStore } from '@/stores/visor'
import GridMode from '@/components/viewer/modes/GridMode.vue'

vi.mock('@/galavi/slice-grid', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/galavi/slice-grid')>()
  return {
    ...actual,
    createSliceGrid: vi.fn(),
  }
})

const mockCreateSliceGrid = vi.mocked(createSliceGrid)

// 800×600 jsdom viewport → 5 columns × 3 rows = 15 cells per page.
const VIEWPORT_W = 800
const VIEWPORT_H = 600
const CELLS_PER_PAGE = 15

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Same minimal CereviDataset shape as visor-select.test.ts: slice orientations
// plus the named plane/volume resources the grid's helpers read.
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

function fakeGrid() {
  return {
    runtime: { requestRender: vi.fn() },
    mount: vi.fn().mockResolvedValue(undefined),
    setSlices: vi.fn(),
    setChannels: vi.fn(),
    destroy: vi.fn(),
  } as unknown as SliceGrid & {
    mount: ReturnType<typeof vi.fn>
    setSlices: ReturnType<typeof vi.fn>
    setChannels: ReturnType<typeof vi.fn>
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

function lastOptions(): CreateSliceGridOptions {
  return mockCreateSliceGrid.mock.calls.at(-1)![0]
}

describe('GridMode rebuild lifetime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
    // jsdom layout is 0×0 — the grid's layout math needs a real viewport size.
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      get() { return VIEWPORT_W },
    })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      get() { return VIEWPORT_H },
    })
    Element.prototype.scrollIntoView = () => {}
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientWidth
    delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
    delete (Element.prototype as unknown as Record<string, unknown>).scrollIntoView
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('builds a 15-slot pool and mounts the 15 cell canvases in slot order', async () => {
    const first = fakeGrid()
    mockCreateSliceGrid.mockResolvedValueOnce(first)
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    await flushPromises()

    // Plane 'xy' walks storage axis 1 of its xz source → 20 slices, page 1
    // shows slices 0–14 — all visible, in storage space (no reversal here).
    expect(lastOptions().slices).toEqual(Array.from({ length: CELLS_PER_PAGE }, (_, i) => i))
    expect(lastOptions().channels).toHaveLength(1)
    expect(first.mount).toHaveBeenCalledTimes(1)
    const canvases = first.mount.mock.calls[0]![0] as HTMLCanvasElement[]
    expect(canvases).toHaveLength(CELLS_PER_PAGE)
    expect(canvases.every((canvas) => canvas instanceof HTMLCanvasElement)).toBe(true)

    wrapper.unmount()
    expect(first.destroy).toHaveBeenCalledTimes(1)
  })

  it('turns the page as ONE setSlices call, hiding unused tail slots', async () => {
    const first = fakeGrid()
    mockCreateSliceGrid.mockResolvedValueOnce(first)
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    await flushPromises()

    // Page 2 of 2: slices 15–19 visible, slots 5–14 hidden (20 slices total).
    const stops = wrapper.findAll('.page-stop')
    expect(stops).toHaveLength(2)
    await stops[1]!.trigger('click')

    expect(first.setSlices).toHaveBeenCalledTimes(1)
    expect(first.setSlices.mock.calls[0]![0]).toEqual([
      15, 16, 17, 18, 19,
      ...Array.from({ length: CELLS_PER_PAGE - 5 }, () => undefined),
    ])

    wrapper.unmount()
  })

  it('applies channel and contrast changes as one setChannels call each', async () => {
    const store = useCereviStore()
    const ctx = {
      ...makeContext('a'),
      channels: [
        { index: 0, label: 'C0', color: '#FFFFFF', contrast: [0, 1], visible: true },
        { index: 1, label: 'C1', color: '#FF0000', contrast: [0, 1], visible: true },
      ],
    } as unknown as CereviDataset
    // The store internals applyContext would wire (it is not exposed): the
    // context itself plus the plane's active imagery source.
    store.setupCtx = ctx
    store.setActiveImagerySource('xz')
    const first = fakeGrid()
    mockCreateSliceGrid.mockResolvedValueOnce(first)
    const wrapper = mount(GridMode, { props: { ctx } })
    await flushPromises()
    first.setChannels.mockClear()

    // Channel switch: selection index, label, and color in one transaction.
    store.setChannel(1)
    await flushPromises()
    expect(first.setChannels).toHaveBeenCalledTimes(1)
    expect(first.setChannels.mock.calls[0]![0]).toEqual([
      { index: 1, label: 'C1', color: '#FF0000', contrast: [0, 1], visible: true },
    ])

    // Contrast change: same single-channel transaction, new window.
    first.setChannels.mockClear()
    store.setContrast([0.25, 0.75])
    await flushPromises()
    expect(first.setChannels).toHaveBeenCalledTimes(1)
    expect(first.setChannels.mock.calls[0]![0]).toEqual([
      { index: 1, label: 'C1', color: '#FF0000', contrast: [0.25, 0.75], visible: true },
    ])

    wrapper.unmount()
  })

  it('keeps the previous grid when a rebuild fails', async () => {
    const store = useCereviStore()
    const first = fakeGrid()
    mockCreateSliceGrid.mockResolvedValueOnce(first)
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    await flushPromises()
    expect(first.mount).toHaveBeenCalledTimes(1)

    mockCreateSliceGrid.mockRejectedValueOnce(new Error('device lost'))
    store.setPlane('yz')
    await flushPromises()

    // The failed replacement never touches the live grid, and no error
    // overlay covers the still-working grid.
    expect(first.destroy).not.toHaveBeenCalled()
    expect(wrapper.find('.mode-error').exists()).toBe(false)

    wrapper.unmount()
    expect(first.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys the old grid only after the replacement has built', async () => {
    const store = useCereviStore()
    const first = fakeGrid()
    const second = fakeGrid()
    mockCreateSliceGrid.mockResolvedValueOnce(first)
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    await flushPromises()

    mockCreateSliceGrid.mockResolvedValueOnce(second)
    store.setPlane('yz')
    await flushPromises()

    expect(first.destroy).toHaveBeenCalledTimes(1)
    expect(second.mount).toHaveBeenCalledTimes(1)
    // Build before destroy, destroy before mount (shared canvas contexts).
    const buildOrder = mockCreateSliceGrid.mock.invocationCallOrder[1]!
    const destroyOrder = first.destroy.mock.invocationCallOrder[0]!
    const mountOrder = second.mount.mock.invocationCallOrder[0]!
    expect(buildOrder).toBeLessThan(destroyOrder)
    expect(destroyOrder).toBeLessThan(mountOrder)
    expect(wrapper.find('.mode-error').exists()).toBe(false)

    wrapper.unmount()
    expect(second.destroy).toHaveBeenCalledTimes(1)
  })

  it('destroys a superseded build result exactly once without mounting it', async () => {
    const store = useCereviStore()
    const slow = deferred<SliceGrid>()
    const late = fakeGrid()
    const current = fakeGrid()
    mockCreateSliceGrid.mockReturnValueOnce(slow.promise)
    const wrapper = mount(GridMode, { props: { ctx: makeContext('a') } })
    // Let the mount build reach its in-flight await...
    await flushPromises()
    expect(mockCreateSliceGrid).toHaveBeenCalledTimes(1)

    // ...then supersede it with a plane-switch rebuild.
    mockCreateSliceGrid.mockResolvedValueOnce(current)
    store.setPlane('yz')
    await flushPromises()
    expect(current.mount).toHaveBeenCalledTimes(1)

    slow.resolve(late)
    await flushPromises()

    expect(late.destroy).toHaveBeenCalledTimes(1)
    expect(late.mount).not.toHaveBeenCalled()
    expect(current.destroy).not.toHaveBeenCalled()

    wrapper.unmount()
    expect(current.destroy).toHaveBeenCalledTimes(1)
    expect(late.destroy).toHaveBeenCalledTimes(1)
  })
})

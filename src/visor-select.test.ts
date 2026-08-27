import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import type { Specimen } from '@/types'
import { openCereviDataset, type CereviDataset } from '@/galavi/specimen-dataset'
import { useCereviStore } from '@/stores/visor'

vi.mock('@/galavi/specimen-dataset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/galavi/specimen-dataset')>()
  return {
    ...actual,
    openCereviDataset: vi.fn(),
  }
})

const mockOpenCereviDataset = vi.mocked(openCereviDataset)

/**
 * Minimal CereviDataset shape: enough for applyContext (slice orientations,
 * named plane resources, physical framing, channels, per-source contrast).
 */
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

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('selectSpecimen', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const store = useCereviStore()
    store.specimens = [
      { id: 'a', name: 'Specimen A' },
      { id: 'b', name: 'Specimen B' },
    ] as Specimen[]
  })

  it('ignores a stale resolution that finishes after a newer selection', async () => {
    const store = useCereviStore()
    const slow = deferred<CereviDataset>()
    const staleDataset = makeContext('a')
    mockOpenCereviDataset.mockReturnValueOnce(slow.promise)
    mockOpenCereviDataset.mockResolvedValueOnce(makeContext('b'))

    const first = store.selectSpecimen('a')
    const second = store.selectSpecimen('b')
    await second
    slow.resolve(staleDataset)
    await first

    expect(store.setupCtx?.specimenId).toBe('b')
    expect(store.currentSpecimen?.id).toBe('b')
    expect(store.ctxLoading).toBe(false)
    expect(store.error).toBeNull()
    // The superseded open's dataset is released, the live one is kept.
    expect(staleDataset.dispose).toHaveBeenCalledTimes(1)
    expect((store.setupCtx as ReturnType<typeof makeContext>).dispose).not.toHaveBeenCalled()
  })

  it('ignores a stale rejection that fails after a newer selection', async () => {
    const store = useCereviStore()
    const slow = deferred<CereviDataset>()
    mockOpenCereviDataset.mockReturnValueOnce(slow.promise)
    mockOpenCereviDataset.mockResolvedValueOnce(makeContext('b'))

    const first = store.selectSpecimen('a')
    const second = store.selectSpecimen('b')
    await second
    slow.reject(new Error('network gone'))
    await first

    expect(store.error).toBeNull()
    expect(store.setupCtx?.specimenId).toBe('b')
    expect(store.ctxLoading).toBe(false)
  })

  it('surfaces a failure from the latest selection', async () => {
    const store = useCereviStore()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    mockOpenCereviDataset.mockRejectedValueOnce(new Error('zarr boom'))

    await store.selectSpecimen('a')

    expect(store.error).toBe('Failed to load image data')
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
    consoleError.mockRestore()
  })

  it('disposes the previous dataset when the specimen changes', async () => {
    const store = useCereviStore()
    const firstDataset = makeContext('a')
    const secondDataset = makeContext('b')
    mockOpenCereviDataset.mockResolvedValueOnce(firstDataset)
    await store.selectSpecimen('a')
    expect(store.setupCtx?.specimenId).toBe('a')

    mockOpenCereviDataset.mockResolvedValueOnce(secondDataset)
    await store.selectSpecimen('b')

    expect(firstDataset.dispose).toHaveBeenCalledTimes(1)
    expect(secondDataset.dispose).not.toHaveBeenCalled()
    expect(store.setupCtx?.specimenId).toBe('b')
  })
})

describe('releaseDataset', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const store = useCereviStore()
    store.specimens = [
      { id: 'a', name: 'Specimen A' },
      { id: 'b', name: 'Specimen B' },
    ] as Specimen[]
  })

  it('disposes the loaded dataset and clears setup-owned state', async () => {
    const store = useCereviStore()
    const dataset = makeContext('a')
    mockOpenCereviDataset.mockResolvedValueOnce(dataset)
    await store.selectSpecimen('a')
    expect(store.setupCtx?.specimenId).toBe('a')

    store.releaseDataset()

    expect(dataset.dispose).toHaveBeenCalledTimes(1)
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
  })

  it('disposes a late success that resolves after the release', async () => {
    const store = useCereviStore()
    const slow = deferred<CereviDataset>()
    const lateDataset = makeContext('a')
    mockOpenCereviDataset.mockReturnValueOnce(slow.promise)

    const pending = store.selectSpecimen('a')
    expect(store.ctxLoading).toBe(true)
    store.releaseDataset()
    expect(store.ctxLoading).toBe(false)

    slow.resolve(lateDataset)
    await pending

    // The superseded open's dataset is released and never populates the store.
    expect(lateDataset.dispose).toHaveBeenCalledTimes(1)
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('suppresses a late rejection that fails after the release', async () => {
    const store = useCereviStore()
    const slow = deferred<CereviDataset>()
    mockOpenCereviDataset.mockReturnValueOnce(slow.promise)

    const pending = store.selectSpecimen('a')
    store.releaseDataset()
    slow.reject(new Error('network gone'))
    await pending

    expect(store.error).toBeNull()
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
  })

  it('disposes exactly once when a specimen switch is followed by a release', async () => {
    const store = useCereviStore()
    const firstDataset = makeContext('a')
    const lateDataset = makeContext('b')
    mockOpenCereviDataset.mockResolvedValueOnce(firstDataset)
    await store.selectSpecimen('a')

    const slow = deferred<CereviDataset>()
    mockOpenCereviDataset.mockReturnValueOnce(slow.promise)
    const pending = store.selectSpecimen('b')
    // The switch itself disposed the first dataset exactly once.
    expect(firstDataset.dispose).toHaveBeenCalledTimes(1)

    store.releaseDataset()
    slow.resolve(lateDataset)
    await pending

    expect(firstDataset.dispose).toHaveBeenCalledTimes(1)
    expect(lateDataset.dispose).toHaveBeenCalledTimes(1)
    expect(store.setupCtx).toBeNull()
  })

  it('disposes exactly once across repeated releases', async () => {
    const store = useCereviStore()
    const dataset = makeContext('a')
    mockOpenCereviDataset.mockResolvedValueOnce(dataset)
    await store.selectSpecimen('a')

    store.releaseDataset()
    store.releaseDataset()

    expect(dataset.dispose).toHaveBeenCalledTimes(1)
    expect(store.setupCtx).toBeNull()
  })
})

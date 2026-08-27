// @vitest-environment jsdom

import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import type { Specimen } from '@/types'
import { openCereviDataset, type CereviDataset } from '@/galavi/specimen-dataset'
import { useCereviStore } from '@/stores/visor'
import ViewerShell from '@/views/ViewerShell.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/galavi/specimen-dataset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/galavi/specimen-dataset')>()
  return {
    ...actual,
    openCereviDataset: vi.fn(),
  }
})

const mockOpenCereviDataset = vi.mocked(openCereviDataset)

// Same minimal CereviDataset shape as visor-select.test.ts: enough for
// applyContext (slice orientations, plane resources, physical framing,
// channels, contrast).
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

describe('ViewerShell route lifetime', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    const store = useCereviStore()
    store.specimens = [
      { id: 'a', name: 'Specimen A' },
      { id: 'b', name: 'Specimen B' },
    ] as Specimen[]
  })

  it('resolves the specimen on mount and releases the dataset on unmount', async () => {
    const store = useCereviStore()
    const dataset = makeContext('a')
    mockOpenCereviDataset.mockResolvedValueOnce(dataset)

    const wrapper = shallowMount(ViewerShell, { props: { specimenId: 'a' } })
    await flushPromises()
    expect(store.setupCtx?.specimenId).toBe('a')

    wrapper.unmount()

    expect(dataset.dispose).toHaveBeenCalledTimes(1)
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
  })

  it('disposes a late dataset open that resolves after unmount', async () => {
    const store = useCereviStore()
    const slow = deferred<CereviDataset>()
    const lateDataset = makeContext('a')
    mockOpenCereviDataset.mockReturnValueOnce(slow.promise)

    const wrapper = shallowMount(ViewerShell, { props: { specimenId: 'a' } })
    // The open is in flight when the route unmounts.
    expect(store.ctxLoading).toBe(true)
    wrapper.unmount()
    expect(store.ctxLoading).toBe(false)

    slow.resolve(lateDataset)
    await flushPromises()

    expect(lateDataset.dispose).toHaveBeenCalledTimes(1)
    expect(store.setupCtx).toBeNull()
    expect(store.error).toBeNull()
  })

  it('suppresses a late dataset open rejection after unmount', async () => {
    const store = useCereviStore()
    const slow = deferred<CereviDataset>()
    mockOpenCereviDataset.mockReturnValueOnce(slow.promise)

    const wrapper = shallowMount(ViewerShell, { props: { specimenId: 'a' } })
    wrapper.unmount()

    slow.reject(new Error('network gone'))
    await flushPromises()

    expect(store.error).toBeNull()
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
  })
})

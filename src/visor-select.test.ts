import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import type { Specimen } from '@/types'
import { buildSetupContext, type SetupContext } from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'

vi.mock('@/galavi-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/galavi-setup')>()
  return {
    ...actual,
    buildSetupContext: vi.fn(),
  }
})

const mockBuildSetupContext = vi.mocked(buildSetupContext)

function makeContext(specimenId: string): SetupContext {
  const level = (shape: Vec3, scale: Vec3) => ({
    levels: [{ path: '0', shape, chunkSize: shape, scale }],
  })
  return {
    specimenId,
    volumeInfo: {
      origin: [0, 0, 0],
      spatialUnits: ['μm', 'μm', 'μm'],
      pyramid: level([10, 20, 30], [1, 1, 1]),
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
  } as unknown as SetupContext
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
    const slow = deferred<SetupContext>()
    mockBuildSetupContext.mockReturnValueOnce(slow.promise)
    mockBuildSetupContext.mockResolvedValueOnce(makeContext('b'))

    const first = store.selectSpecimen('a')
    const second = store.selectSpecimen('b')
    await second
    slow.resolve(makeContext('a'))
    await first

    expect(store.setupCtx?.specimenId).toBe('b')
    expect(store.currentSpecimen?.id).toBe('b')
    expect(store.ctxLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('ignores a stale rejection that fails after a newer selection', async () => {
    const store = useCereviStore()
    const slow = deferred<SetupContext>()
    mockBuildSetupContext.mockReturnValueOnce(slow.promise)
    mockBuildSetupContext.mockResolvedValueOnce(makeContext('b'))

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
    mockBuildSetupContext.mockRejectedValueOnce(new Error('zarr boom'))

    await store.selectSpecimen('a')

    expect(store.error).toBe('Failed to load image data')
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
    consoleError.mockRestore()
  })
})

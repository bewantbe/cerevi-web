// @vitest-environment jsdom

import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Vec3 } from 'galavi'
import type { Specimen } from '@/types'
import { buildSetupContext, type SetupContext } from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'
import ViewerShell from '@/views/ViewerShell.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/galavi-setup', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/galavi-setup')>()
  return {
    ...actual,
    buildSetupContext: vi.fn(),
  }
})

const mockBuildSetupContext = vi.mocked(buildSetupContext)

// Same minimal SetupContext shape as visor-select.test.ts: enough for
// applyContext (slice defs/sources, physical framing, channels, contrast).
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

  it('resolves the specimen on mount and releases the context on unmount', async () => {
    const store = useCereviStore()
    const ctx = makeContext('a')
    mockBuildSetupContext.mockResolvedValueOnce(ctx)

    const wrapper = shallowMount(ViewerShell, { props: { specimenId: 'a' } })
    await flushPromises()
    expect(store.setupCtx?.specimenId).toBe('a')

    wrapper.unmount()

    expect(ctx.dispose).toHaveBeenCalledTimes(1)
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
  })

  it('disposes a late context build that resolves after unmount', async () => {
    const store = useCereviStore()
    const slow = deferred<SetupContext>()
    const lateCtx = makeContext('a')
    mockBuildSetupContext.mockReturnValueOnce(slow.promise)

    const wrapper = shallowMount(ViewerShell, { props: { specimenId: 'a' } })
    // The build is in flight when the route unmounts.
    expect(store.ctxLoading).toBe(true)
    wrapper.unmount()
    expect(store.ctxLoading).toBe(false)

    slow.resolve(lateCtx)
    await flushPromises()

    expect(lateCtx.dispose).toHaveBeenCalledTimes(1)
    expect(store.setupCtx).toBeNull()
    expect(store.error).toBeNull()
  })

  it('suppresses a late context build rejection after unmount', async () => {
    const store = useCereviStore()
    const slow = deferred<SetupContext>()
    mockBuildSetupContext.mockReturnValueOnce(slow.promise)

    const wrapper = shallowMount(ViewerShell, { props: { specimenId: 'a' } })
    wrapper.unmount()

    slow.reject(new Error('network gone'))
    await flushPromises()

    expect(store.error).toBeNull()
    expect(store.setupCtx).toBeNull()
    expect(store.ctxLoading).toBe(false)
  })
})

import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'
import type { AxisMap, Vec3 } from 'galavi'
import { useCereviStore } from '@/stores/visor'
import { withDefaultSelectionDepth } from '@/lib/coordinates'
import type { SetupContext } from '@/galavi-setup'

// Storage layout shared by these tests (RAS/xyz orientation):
//   xy view slices along storage y from the 'xz' source
//   xz view slices along storage z from the 'xy' source
//   yz view slices along storage x from the 'yz' source
function makeStoreContext(): SetupContext {
  const level = (shape: Vec3, scale: Vec3) => ({
    levels: [{ path: '0', shape, chunkSize: shape, scale }],
  })
  return {
    volumeInfo: {
      origin: [0, 0, -100],
      spatialUnits: ['μm', 'μm', 'μm'],
      pyramid: level([100, 200, 50], [1, 1, 4]),
    },
    sliceDefs: {
      xy: { axisMap: [0, 2, 1], sourcePlane: 'xz' },
      xz: { axisMap: [0, 1, 2], sourcePlane: 'xy' },
      yz: { axisMap: [1, 2, 0], sourcePlane: 'yz' },
    },
    sliceSources: {
      xy: { info: { origin: [0, 0, -100] }, pyramid: level([100, 200, 50], [1, 1, 4]) },
      xz: { info: { origin: [0, -30, -100] }, pyramid: level([100, 60, 50], [1, 2, 4]) },
      yz: { info: { origin: [-120, 0, -100] }, pyramid: level([80, 200, 50], [3, 1, 4]) },
    },
  } as unknown as SetupContext
}

describe('store position math', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('round-trips slice index through physical position on every plane', () => {
    const store = useCereviStore()
    store.setupCtx = makeStoreContext()

    for (const index of [0, 1, 40, 79]) {
      expect(store.sliceForPosition('yz', [store.positionForSlice('yz', index), 0, 0])).toBe(index)
    }
    for (const index of [0, 10, 59]) {
      expect(store.sliceForPosition('xy', [0, store.positionForSlice('xy', index), 0])).toBe(index)
    }
    for (const index of [0, 25, 49]) {
      expect(store.sliceForPosition('xz', [0, 0, store.positionForSlice('xz', index)])).toBe(index)
    }
  })

  it('maps slice indices to voxel-center positions using origin and scale', () => {
    const store = useCereviStore()
    store.setupCtx = makeStoreContext()

    // yz: axis x, origin -120, scale 3 → origin + (i + 0.5) * scale
    expect(store.positionForSlice('yz', 0)).toBe(-118.5)
    expect(store.positionForSlice('yz', 40)).toBe(1.5)
    // xy: axis y, origin -30, scale 2
    expect(store.positionForSlice('xy', 10)).toBe(-9)
  })

  it('clamps out-of-range indices and positions to the slice stack', () => {
    const store = useCereviStore()
    store.setupCtx = makeStoreContext()

    expect(store.positionForSlice('yz', -3)).toBe(store.positionForSlice('yz', 0))
    expect(store.positionForSlice('yz', 999)).toBe(store.positionForSlice('yz', 79))
    expect(store.sliceForPosition('yz', [-10000, 0, 0])).toBe(0)
    expect(store.sliceForPosition('yz', [10000, 0, 0])).toBe(79)
  })

  it('returns zero-position fallbacks without a setup context', () => {
    const store = useCereviStore()

    expect(store.positionForSlice('xy', 5)).toBe(0)
    expect(store.sliceForPosition('xy', [1, 2, 3])).toBe(0)
  })

  it('clamps setCenter into the physical bounds and syncs every slice', () => {
    const store = useCereviStore()
    store.setupCtx = makeStoreContext()
    // Volume: size [100, 200, 200], center [50, 100, 0]
    // → bounds min [0, 0, -100], max [100, 200, 100].
    store.setCenter([-10, 500, 50])

    expect(store.centerPosition).toEqual([0, 200, 50])
    expect(store.sliceByPlane).toEqual({ xy: 59, yz: 40, xz: 37 })
  })

  it('clamps the cursor position into the physical bounds', () => {
    const store = useCereviStore()
    store.setupCtx = makeStoreContext()

    store.setCursor([-5, 250, 10])
    expect(store.cursorPosition).toEqual([0, 200, 10])

    store.setCursor(null)
    expect(store.cursorPosition).toBeNull()
  })

  it('moves the center along the slice axis when the slice changes', () => {
    const store = useCereviStore()
    store.setupCtx = makeStoreContext()
    store.setCenter([10, 20, 30])

    store.setSlice('yz', 10)

    expect(store.sliceByPlane.yz).toBe(10)
    expect(store.centerPosition[0]).toBe(-88.5)
    expect(store.centerPosition[1]).toBe(20)
    expect(store.centerPosition[2]).toBe(30)
  })
})

describe('withDefaultSelectionDepth', () => {
  const bounds = { min: [0, 0, 0] as Vec3, max: [100, 100, 60] as Vec3 }
  const axisMap: AxisMap = [0, 1, 2]
  const flat = { min: [10, 10, 0] as Vec3, max: [30, 50, 0] as Vec3 }

  it('centers the longest in-plane side as depth around the slice', () => {
    const next = withDefaultSelectionDepth(flat, axisMap, 30, bounds)

    // longest side = 40 (v axis) → depth 40 centered on 30.
    expect(next.min[2]).toBe(10)
    expect(next.max[2]).toBe(50)
    // In-plane extents are untouched.
    expect(next.min[0]).toBe(10)
    expect(next.max[0]).toBe(30)
    expect(next.min[1]).toBe(10)
    expect(next.max[1]).toBe(50)
  })

  it('shifts the depth window up when it dips below the lower bound', () => {
    const next = withDefaultSelectionDepth(flat, axisMap, 5, bounds)

    expect(next.min[2]).toBe(0)
    expect(next.max[2]).toBe(40)
  })

  it('shifts the depth window down when it exceeds the upper bound', () => {
    const next = withDefaultSelectionDepth(flat, axisMap, 55, bounds)

    expect(next.min[2]).toBe(20)
    expect(next.max[2]).toBe(60)
  })

  it('caps the depth at the full bounds extent', () => {
    const wide = { min: [0, 0, 0] as Vec3, max: [200, 10, 0] as Vec3 }

    const next = withDefaultSelectionDepth(wide, axisMap, 30, bounds)

    expect(next.min[2]).toBe(0)
    expect(next.max[2]).toBe(60)
  })
})

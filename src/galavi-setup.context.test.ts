import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetch2DPlane,
  openOMEZarr,
  type OMEZarrInfo,
  type Plane2D,
} from '@galavi/ome-zarr-adapter'
import type { AxisMap, Vec3 } from 'galavi'
import CereviAPI from '@/services/api'
import type { Specimen } from '@/types'
import { buildSetupContext, SLICE_PLANES } from './galavi-setup'

vi.mock('@galavi/ome-zarr-adapter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@galavi/ome-zarr-adapter')>()
  return {
    ...actual,
    openOMEZarr: vi.fn(),
    fetch2DPlane: vi.fn(),
  }
})

const mockOpenOMEZarr = vi.mocked(openOMEZarr)
const mockFetch2DPlane = vi.mocked(fetch2DPlane)

function makeVolumeInfo(overrides: Partial<OMEZarrInfo> = {}): OMEZarrInfo {
  return {
    dtype: 'uint16',
    name: 'volume',
    sourceUrl: '',
    omeVersion: '0.5',
    pyramid: {
      levels: [{
        path: '0',
        index: 0,
        shape: [10, 20, 30] as Vec3,
        chunkSize: [10, 20, 30] as Vec3,
        numChunks: [1, 1, 1] as Vec3,
        scale: [2, 2, 4] as Vec3,
      }],
    },
    selectionDims: [{ name: 'c', size: 2 }],
    defaultSelection: { c: 1 },
    origin: [0, 0, 0],
    spatialUnits: ['μm', 'μm', 'μm'],
    omeroChannelLabels: ['DAPI', 'GFP'],
    omeroChannelColors: ['#00ff00', 'not-a-color'],
    omeroChannelContrastLimits: [[0.1, 0.9], undefined],
    fetchTile: () => Promise.resolve(new ArrayBuffer(0)),
    ...overrides,
  }
}

function makePlane(name: string): Plane2D {
  const info = makeVolumeInfo({ name, omeroChannelContrastLimits: [[0.2, 0.8]] })
  return {
    info,
    pyramid: info.pyramid,
    fetch: () => Promise.resolve(new ArrayBuffer(0)),
  }
}

function makeSpecimen(overrides: Partial<Specimen> = {}): Specimen {
  return {
    id: 'spec-1',
    name: 'Specimen 1',
    image: {
      v1: {
        RAS_coordinate: 'RAS',
        axes_order: 'xyz',
        files: ['vol.zarr', 'xy.zarr', 'xz.zarr', 'yz.zarr'],
        modes: {
          '3d': [[0, [], []]],
          xy: [[1, [], []]],
          xz: [[2, [], []]],
          yz: [[3, [], []]],
        },
      },
    },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(CereviAPI, 'dataUrl').mockImplementation((path) => `/data/${path}`)
  mockOpenOMEZarr.mockResolvedValue(makeVolumeInfo())
  mockFetch2DPlane.mockImplementation((url) => Promise.resolve(makePlane(url)))
})

describe('buildSetupContext', () => {
  it('resolves specimen mode files through the API and opens each source', async () => {
    const ctx = await buildSetupContext(makeSpecimen())

    expect(mockOpenOMEZarr).toHaveBeenCalledWith('/data/vol.zarr')
    const planeCalls = mockFetch2DPlane.mock.calls.map(([url]) => url)
    expect(planeCalls).toEqual(['/data/xy.zarr', '/data/xz.zarr', '/data/yz.zarr'])
    expect(ctx.specimenId).toBe('spec-1')
    expect(Object.keys(ctx.sliceSources).sort()).toEqual([...SLICE_PLANES].sort())
  })

  it('routes each 2D fetch through the axis map of the view that consumes it', async () => {
    // RAS/xyz orientation: xz view slices along storage y from the xy source,
    // xy view slices along storage z from the xz source, yz view along x.
    await buildSetupContext(makeSpecimen())

    const axisMapByUrl = new Map<string, AxisMap>(
      mockFetch2DPlane.mock.calls.map(([url, axisMap]) => [url, axisMap]),
    )
    expect(axisMapByUrl.get('/data/xy.zarr')).toEqual([0, 1, 2])
    expect(axisMapByUrl.get('/data/xz.zarr')).toEqual([0, 2, 1])
    expect(axisMapByUrl.get('/data/yz.zarr')).toEqual([1, 2, 0])
  })

  it('parses orientation metadata into slice defs and storage reversal flags', async () => {
    const specimen = makeSpecimen()
    specimen.image!.v1.RAS_coordinate = 'rAS'

    const ctx = await buildSetupContext(specimen)

    // Lowercase 'r' means storage x runs opposite to the R axis.
    expect(ctx.storageReversed).toEqual([false, true, true])
    expect(ctx.sliceDefs.xy.anatomicalLabel).toBe('Coronal')
    expect(ctx.sliceDefs.yz.anatomicalLabel).toBe('Sagittal')
    expect(ctx.sliceDefs.xz.anatomicalLabel).toBe('Horizontal')
  })

  it('builds channel info and contrast limits from adapter metadata', async () => {
    const ctx = await buildSetupContext(makeSpecimen())

    expect(ctx.initCh).toBe(1)
    expect(ctx.channelCount).toBe(2)
    expect(ctx.channels.map((channel) => channel.label)).toEqual(['DAPI', 'GFP'])
    expect(ctx.channels[0]!.color).toBe('#00FF00')
    // Malformed/missing metadata color falls back to the palette.
    expect(ctx.channels[1]!.color).toBe('#FF3D3D')
    expect(ctx.imageryContrastLimits.volume).toEqual([[0.1, 0.9], [0, 1]])
    expect(ctx.imageryContrastLimits.xy).toEqual([[0.2, 0.8], [0, 1]])
  })

  it('initializes mesh state from mesh metadata when present', async () => {
    const specimen = makeSpecimen({
      mesh: {
        m1: {
          downsample_factor: 4,
          files: ['mesh.obj'],
          modes: { '3d': [[0, [], ['42']]] },
        },
      },
    })

    const ctx = await buildSetupContext(specimen)

    expect(ctx.hasMesh).toBe(true)
    expect(ctx.meshUrl).toBe('/data/mesh.obj')
    expect(ctx.meshDownsampleFactor).toBe(4)
    expect(ctx.initRegion).toBe('42')
  })

  it('reports no mesh when the specimen has no mesh variants', async () => {
    const ctx = await buildSetupContext(makeSpecimen())

    expect(ctx.hasMesh).toBe(false)
    expect(ctx.meshUrl).toBe('')
    expect(ctx.meshDownsampleFactor).toBeNull()
    expect(ctx.initRegion).toBe('')
  })

  it('rejects a specimen without image versions', async () => {
    await expect(buildSetupContext({ id: 'nope', name: 'Nope' })).rejects.toThrow(
      'Specimen nope has no image versions',
    )
  })

  it('rejects an image version without orientation metadata', async () => {
    const specimen = makeSpecimen()
    delete specimen.image!.v1.RAS_coordinate

    await expect(buildSetupContext(specimen)).rejects.toThrow(
      'Specimen spec-1 image v1 has no orientation metadata',
    )
  })

  it('rejects when a required mode source is missing', async () => {
    const specimen = makeSpecimen()
    delete specimen.image!.v1.modes!['3d']

    await expect(buildSetupContext(specimen)).rejects.toThrow('v1 has no 3d source')
  })

  it('rejects invalid mesh metadata', async () => {
    const specimen = makeSpecimen({ mesh: { m1: undefined } as unknown as Specimen['mesh'] })

    await expect(buildSetupContext(specimen)).rejects.toThrow(
      'Specimen spec-1 has invalid mesh metadata',
    )
  })

  it('propagates adapter open failures', async () => {
    mockOpenOMEZarr.mockRejectedValue(new Error('zarr boom'))

    await expect(buildSetupContext(makeSpecimen())).rejects.toThrow('zarr boom')
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { DatasetChannel, Vec3 } from 'galavi/advanced'
import {
  fetch2DPlane,
  openOMEZarrDataset,
  type ImageDataset,
  type OMEZarrInfo,
  type Plane2D,
} from 'galavi/ome-zarr'
import type { AxisMap } from 'galavi/advanced'
import CereviAPI from '@/services/api'
import type { Specimen } from '@/types'
import { buildLayers, buildSetupContext, SLICE_PLANES } from './galavi-setup'

vi.mock('galavi/ome-zarr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('galavi/ome-zarr')>()
  return {
    ...actual,
    openOMEZarrDataset: vi.fn(),
    fetch2DPlane: vi.fn(),
  }
})

const mockOpenOMEZarrDataset = vi.mocked(openOMEZarrDataset)
const mockFetch2DPlane = vi.mocked(fetch2DPlane)

/** Every mock dataset created by makeDataset, oldest first (reset per test). */
let openedDatasets: Array<ImageDataset & { dispose: ReturnType<typeof vi.fn> }> = []

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
    selectionDims: [{ name: 'c', size: 2 }, { name: 't', size: 3 }],
    defaultSelection: { c: 1, t: 2 },
    origin: [0, 0, 0],
    spatialUnits: ['μm', 'μm', 'μm'],
    omeroChannelLabels: ['DAPI', 'GFP'],
    omeroChannelColors: ['#00ff00', 'not-a-color'],
    omeroChannelContrastLimits: [[0.1, 0.9], undefined],
    fetchTile: () => Promise.resolve(new ArrayBuffer(0)),
    ...overrides,
  }
}

/**
 * A loaded ImageDataset as `openOMEZarrDataset` would return it for
 * makeVolumeInfo(): normalized channels (labels/colors/contrast resolved by
 * galavi, not cerevi), physical space from finest-level shape × scale
 * ([10,20,30] × [2,2,4]), and a tracked dispose.
 */
function makeDataset(url: string): ImageDataset & { dispose: ReturnType<typeof vi.fn> } {
  const info = makeVolumeInfo({ sourceUrl: url })
  const channels: DatasetChannel[] = [
    { index: 0, label: 'DAPI', color: '#00FF00', contrast: [0.1, 0.9], visible: true },
    { index: 1, label: 'GFP', color: '#0000FF', contrast: [0, 1], visible: true },
  ]
  const dataset = {
    type: 'ome-zarr',
    config: { type: 'ome-zarr', source: url },
    name: info.name,
    info,
    pyramid: info.pyramid,
    fetch: info.fetchTile,
    dtype: info.dtype,
    physical: {
      spatial: { size: [20, 40, 120] as Vec3, unit: 'μm', spacing: [2, 2, 4] as Vec3, origin: [0, 0, 0] as Vec3 },
    },
    channels,
    dimensions: info.selectionDims.map((dim) => ({ name: dim.name, size: dim.size })),
    defaultSelection: { ...info.defaultSelection },
    capabilities: { modes: ['slice', 'volume', 'quad'], defaultMode: 'volume' },
    dispose: vi.fn(),
  }
  const tracked = dataset as unknown as ImageDataset & { dispose: ReturnType<typeof vi.fn> }
  openedDatasets.push(tracked)
  return tracked
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
  openedDatasets = []
  vi.spyOn(CereviAPI, 'dataUrl').mockImplementation((path) => `/data/${path}`)
  mockOpenOMEZarrDataset.mockImplementation((url) => Promise.resolve(makeDataset(url)))
  mockFetch2DPlane.mockImplementation((url) => Promise.resolve(makePlane(url)))
})

describe('buildSetupContext', () => {
  it('resolves specimen mode files through the API and opens each source', async () => {
    const ctx = await buildSetupContext(makeSpecimen())

    expect(mockOpenOMEZarrDataset).toHaveBeenCalledWith('/data/vol.zarr')
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

  it('passes channel info through from the dataset and builds per-source contrast limits', async () => {
    const ctx = await buildSetupContext(makeSpecimen())

    expect(ctx.initCh).toBe(1)
    expect(ctx.channelCount).toBe(2)
    expect(ctx.channels.map((channel) => channel.label)).toEqual(['DAPI', 'GFP'])
    expect(ctx.channels.map((channel) => channel.color)).toEqual(['#00FF00', '#0000FF'])
    expect(ctx.imageryContrastLimits.volume).toEqual([[0.1, 0.9], [0, 1]])
    expect(ctx.imageryContrastLimits.xy).toEqual([[0.2, 0.8], [0, 1]])
  })

  it('exposes the opened ImageDataset and derives channel state from it', async () => {
    const ctx = await buildSetupContext(makeSpecimen())

    expect(ctx.dataset.config).toEqual({ type: 'ome-zarr', source: '/data/vol.zarr' })
    expect(ctx.dataset.defaultSelection).toEqual({ c: 1, t: 2 })
    expect(ctx.dataset.dimensions).toEqual([{ name: 'c', size: 2 }, { name: 't', size: 3 }])
    expect(ctx.dataset.channels.map((channel) => channel.label)).toEqual(['DAPI', 'GFP'])
    expect(ctx.dataset.channels.map((channel) => channel.contrast)).toEqual([[0.1, 0.9], [0, 1]])
    // Physical space from finest-level shape × scale ([10,20,30] × [2,2,4]).
    expect(ctx.dataset.physical.spatial.size).toEqual([20, 40, 120])
    // The raw parsed OME-Zarr metadata stays available on the dataset.
    expect(ctx.dataset.info?.omeVersion).toBe('0.5')
    expect(ctx.dataset.info?.dtype).toBe('uint16')
    // Context channel state IS the dataset's, not a local re-derivation.
    expect(ctx.channels).toBe(ctx.dataset.channels)
    expect(ctx.channelCount).toBe(ctx.dataset.channels.length)
    expect(ctx.initCh).toBe(ctx.dataset.defaultSelection.c)
    expect(ctx.imageryContrastLimits.volume).toEqual(
      ctx.dataset.channels.map((channel) => channel.contrast),
    )
  })

  it('builds the volume layer from the dataset with nested channel selection', async () => {
    const ctx = await buildSetupContext(makeSpecimen())

    const volume = buildLayers(ctx).find((layer) => layer.id === 'volume')

    expect(volume?.data?.fetch).toBe(ctx.dataset.fetch)
    expect(volume?.data?.pyramid).toBe(ctx.dataset.pyramid)
    // Nested selection: the dataset's defaultSelection is spread and only the
    // channel index `c` is overridden — other dims (t) pass through untouched.
    const selection = (volume?.options as { selection?: Record<string, number> } | undefined)?.selection
    expect(selection).toEqual({ ...ctx.dataset.defaultSelection, c: ctx.initCh })
    expect(selection?.c).toBe(1)
    expect(selection?.t).toBe(2)
  })

  it('owns the opened volume dataset and disposes it with the context', async () => {
    const ctx = await buildSetupContext(makeSpecimen())

    expect(openedDatasets).toHaveLength(1)
    ctx.dispose()

    expect(ctx.dataset.dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes the opened volume dataset when a sibling source fails', async () => {
    mockFetch2DPlane.mockRejectedValue(new Error('plane boom'))

    await expect(buildSetupContext(makeSpecimen())).rejects.toThrow('plane boom')
    expect(openedDatasets).toHaveLength(1)
    expect(openedDatasets[0]!.dispose).toHaveBeenCalledTimes(1)
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

  it('rejects invalid mesh metadata and disposes the dataset', async () => {
    const specimen = makeSpecimen({ mesh: { m1: undefined } as unknown as Specimen['mesh'] })

    await expect(buildSetupContext(specimen)).rejects.toThrow(
      'Specimen spec-1 has invalid mesh metadata',
    )
    expect(openedDatasets).toHaveLength(1)
    expect(openedDatasets[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  it('propagates dataset open failures', async () => {
    mockOpenOMEZarrDataset.mockRejectedValue(new Error('zarr boom'))

    await expect(buildSetupContext(makeSpecimen())).rejects.toThrow('zarr boom')
  })
})

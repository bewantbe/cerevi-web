import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  openDataset,
  type Dataset,
  type DatasetChannel,
  type DatasetConfig,
  type ImagePyramidResource,
  type Vec3,
} from 'galavi'
import type { AxisMap } from 'galavi'
import { fetch2DPlane, type OMEZarrInfo, type Plane2D } from 'galavi/ome-zarr'
import CereviAPI, { api } from '@/services/api'
import type { Specimen } from '@/types'
import { buildLayers } from '@/galavi/layer-factories'
import { SLICE_PLANES } from '@/galavi/slice-geometry'
import {
  CereviDataset,
  cereviSpecimen,
  openCereviDataset,
} from '@/galavi/specimen-dataset'

// The Dataset boundary: the volume child opens through galavi's openDataset
// (the registry), the precomputed planes through fetch2DPlane (a source detail
// of the cerevi-specimen kind, not a Dataset kind of its own). Tests mock
// exactly these two seams; the cerevi-specimen dispatch itself runs for real.
const hoisted = vi.hoisted(() => ({
  actualOpenDataset: undefined as unknown as typeof openDataset,
}))

vi.mock('galavi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('galavi')>()
  hoisted.actualOpenDataset = actual.openDataset
  return { ...actual, openDataset: vi.fn() }
})

vi.mock('galavi/ome-zarr', async (importOriginal) => {
  const actual = await importOriginal<typeof import('galavi/ome-zarr')>()
  return {
    ...actual,
    fetch2DPlane: vi.fn(),
  }
})

const mockOpenDataset = vi.mocked(openDataset)
const mockFetch2DPlane = vi.mocked(fetch2DPlane)

/** Every fake volume child created by makeVolumeChild, oldest first (reset per test). */
let openedChildren: Array<Dataset & { dispose: ReturnType<typeof vi.fn> }> = []

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
 * A loaded volume child as the real OMEZarrDataset would look after load():
 * normalized channels, physical space from finest-level shape × scale
 * ([10,20,30] × [2,2,4]), one primary image resource, and a tracked dispose.
 */
function makeVolumeChild(url: string): Dataset & { dispose: ReturnType<typeof vi.fn> } {
  const info = makeVolumeInfo({ sourceUrl: url })
  const channels: DatasetChannel[] = [
    { index: 0, label: 'DAPI', color: '#00FF00', contrast: [0.1, 0.9], visible: true },
    { index: 1, label: 'GFP', color: '#0000FF', contrast: [0, 1], visible: true },
  ]
  const physical = {
    spatial: { size: [20, 40, 120] as Vec3, unit: 'μm', spacing: [2, 2, 4] as Vec3, origin: [0, 0, 0] as Vec3 },
  }
  const dimensions = info.selectionDims.map((dim) => ({ name: dim.name, size: dim.size }))
  const defaultSelection = { ...info.defaultSelection }
  const imageResource: ImagePyramidResource = {
    id: 'image',
    kind: 'image-pyramid',
    pyramid: info.pyramid,
    fetch: info.fetchTile,
    physical,
    dimensions,
    defaultSelection,
    channels,
  }
  const child = {
    type: 'ome-zarr',
    config: { type: 'ome-zarr', source: url },
    name: info.name,
    info,
    physical,
    channels,
    dimensions,
    defaultSelection,
    resources: [imageResource],
    primaryResourceId: imageResource.id,
    resource: (kind: string, id?: string) =>
      kind === imageResource.kind && (id === undefined || id === imageResource.id)
        ? imageResource
        : undefined,
    dispose: vi.fn(),
  }
  const tracked = child as unknown as Dataset & { dispose: ReturnType<typeof vi.fn> }
  openedChildren.push(tracked)
  return tracked
}

function makePlane(name: string): Plane2D {
  const info = makeVolumeInfo({ name, sourceUrl: name, omeroChannelContrastLimits: [[0.2, 0.8]] })
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

function makeMeshSpecimen(): Specimen {
  return makeSpecimen({
    mesh: {
      m1: {
        downsample_factor: 4,
        files: ['mesh.obj'],
        modes: { '3d': [[0, [], ['42']]] },
      },
    },
  })
}

/** Route the mocked Dataset boundary: cerevi-specimen opens for real, child kinds are faked. */
function dispatchOpenDataset(config: DatasetConfig): Promise<Dataset> {
  if (config.type === 'cerevi-specimen') return hoisted.actualOpenDataset(config)
  if (config.type === 'ome-zarr') return Promise.resolve(makeVolumeChild(config.source))
  return Promise.reject(new Error(`unexpected child dataset config: ${JSON.stringify(config)}`))
}

beforeEach(() => {
  vi.clearAllMocks()
  openedChildren = []
  vi.spyOn(CereviAPI, 'dataUrl').mockImplementation((path) => `/data/${path}`)
  mockOpenDataset.mockImplementation(dispatchOpenDataset)
  mockFetch2DPlane.mockImplementation((url) => Promise.resolve(makePlane(url)))
})

describe('cereviSpecimen descriptor', () => {
  it('resolves specimen mode files through the API into a portable config', () => {
    const config = cereviSpecimen(makeSpecimen())

    expect(config).toEqual({
      type: 'cerevi-specimen',
      id: 'spec-1',
      name: 'Specimen 1',
      image: {
        volume: { type: 'ome-zarr', source: '/data/vol.zarr' },
        planes: {
          xy: { type: 'ome-zarr', source: '/data/xy.zarr' },
          xz: { type: 'ome-zarr', source: '/data/xz.zarr' },
          yz: { type: 'ome-zarr', source: '/data/yz.zarr' },
        },
        ras: 'RAS',
        axesOrder: 'xyz',
      },
    })
  })

  it('is pure JSON (round-trips through JSON.stringify/parse unchanged)', () => {
    const config = cereviSpecimen(makeMeshSpecimen())

    expect(JSON.parse(JSON.stringify(config))).toEqual(config)
  })

  it('carries the optional mesh source, downsample factor, and initial region', () => {
    const config = cereviSpecimen(makeMeshSpecimen())

    expect(config.mesh).toEqual({
      source: '/data/mesh.obj',
      downsampleFactor: 4,
      initialRegion: '42',
    })
  })

  it('omits the mesh block when the specimen has no mesh variants', () => {
    expect(cereviSpecimen(makeSpecimen()).mesh).toBeUndefined()
  })

  it('converts specimens from object- and array-backed specimens.json responses identically', async () => {
    const specimen = makeSpecimen()
    const get = vi.spyOn(api, 'get')
    try {
      get.mockResolvedValueOnce({ data: { 'spec-1': specimen } } as never)
      const fromObject = await CereviAPI.getSpecimens()
      get.mockResolvedValueOnce({ data: [specimen] } as never)
      const fromArray = await CereviAPI.getSpecimens()

      expect(fromObject).toHaveLength(1)
      expect(fromArray).toHaveLength(1)
      expect(cereviSpecimen(fromObject[0]!)).toEqual(cereviSpecimen(fromArray[0]!))
    } finally {
      get.mockRestore()
    }
  })

  it('rejects a specimen without image versions, naming the specimen', () => {
    expect(() => cereviSpecimen({ id: 'nope', name: 'Nope' })).toThrow(
      'Specimen nope has no image versions',
    )
  })

  it('rejects an image variant without orientation metadata, naming specimen and variant', () => {
    const specimen = makeSpecimen()
    delete specimen.image!.v1.RAS_coordinate

    expect(() => cereviSpecimen(specimen)).toThrow(
      'Specimen spec-1 image v1 has no orientation metadata',
    )
  })

  it('rejects when a required mode source is missing, naming the variant', () => {
    const specimen = makeSpecimen()
    delete specimen.image!.v1.modes!['3d']

    expect(() => cereviSpecimen(specimen)).toThrow('v1 has no 3d source')
  })

  it('rejects invalid mesh metadata, naming the specimen', () => {
    const specimen = makeSpecimen({ mesh: { m1: undefined } as unknown as Specimen['mesh'] })

    expect(() => cereviSpecimen(specimen)).toThrow('Specimen spec-1 has invalid mesh metadata')
  })

  it('fails descriptor validation before any source is opened', async () => {
    await expect(openCereviDataset({ id: 'nope', name: 'Nope' })).rejects.toThrow(
      'Specimen nope has no image versions',
    )
    expect(mockOpenDataset).not.toHaveBeenCalled()
    expect(mockFetch2DPlane).not.toHaveBeenCalled()
  })
})

describe('CereviDataset', () => {
  it('is constructed through the typed registry via openDataset', async () => {
    const dataset = await openDataset(cereviSpecimen(makeSpecimen()))

    expect(dataset).toBeInstanceOf(CereviDataset)
    expect(dataset.type).toBe('cerevi-specimen')
    expect(dataset.config).toEqual(cereviSpecimen(makeSpecimen()))
  })

  it('opens the volume and the three plane sources exactly once', async () => {
    const dataset = await openCereviDataset(makeSpecimen())

    expect(mockOpenDataset).toHaveBeenCalledWith({ type: 'ome-zarr', source: '/data/vol.zarr' })
    const planeCalls = mockFetch2DPlane.mock.calls.map(([url]) => url)
    expect(planeCalls).toEqual(['/data/xy.zarr', '/data/xz.zarr', '/data/yz.zarr'])
    expect(dataset.specimenId).toBe('spec-1')
    // One volume child, opened once.
    expect(openedChildren).toHaveLength(1)
  })

  it('routes each 2D plane open through the axis map of the view that consumes it', async () => {
    // RAS/xyz orientation: the xy store feeds the xz view, the xz store feeds
    // the xy view, and the yz store feeds the yz view.
    const dataset = await openCereviDataset(makeSpecimen())

    const axisMapByUrl = new Map<string, AxisMap>(
      mockFetch2DPlane.mock.calls.map(([url, axisMap]) => [url, axisMap]),
    )
    expect(axisMapByUrl.get('/data/xy.zarr')).toEqual([0, 1, 2])
    expect(axisMapByUrl.get('/data/xz.zarr')).toEqual([0, 2, 1])
    expect(axisMapByUrl.get('/data/yz.zarr')).toEqual([1, 2, 0])
    // The same axis maps ride on the named plane resources.
    expect(dataset.planeResource('xy').axisMap).toEqual([0, 1, 2])
    expect(dataset.planeResource('xz').axisMap).toEqual([0, 2, 1])
    expect(dataset.planeResource('yz').axisMap).toEqual([1, 2, 0])
  })

  it('parses orientation metadata into slice orientations and storage reversal flags', async () => {
    const specimen = makeSpecimen()
    specimen.image!.v1.RAS_coordinate = 'rAS'

    const dataset = await openCereviDataset(specimen)

    // Lowercase 'r' means storage x runs opposite to the R axis.
    expect(dataset.storageReversed).toEqual([false, true, true])
    expect(dataset.sliceOrientations.xy.axisMap).toEqual([0, 2, 1])
    expect(dataset.sliceOrientations.xy.sourcePlane).toBe('xz')
    expect(dataset.sliceOrientations.yz.sourcePlane).toBe('yz')
    expect(dataset.sliceOrientations.xz.sourcePlane).toBe('xy')
  })

  it('exposes the volume and three named plane images as stable resources', async () => {
    const dataset = await openCereviDataset(makeSpecimen())

    expect(dataset.resources.map((resource) => resource.id)).toEqual([
      'volume',
      'plane-xy',
      'plane-xz',
      'plane-yz',
    ])
    expect(dataset.primaryResourceId).toBe('volume')
    // The primary lookup (no id) resolves to the volume image.
    expect(dataset.resource('image-pyramid')?.id).toBe('volume')
    // Typed lookups by stable id.
    for (const plane of SLICE_PLANES) {
      expect(dataset.resource('image-pyramid', `plane-${plane}`)?.kind).toBe('image-pyramid')
    }
    // A kind mismatch names the actual kind.
    expect(() => dataset.resource('mesh', 'volume')).toThrow(/is a "image-pyramid" resource/)
  })

  it('takes base metadata from the volume dataset and keeps raw OME info available', async () => {
    const dataset = await openCereviDataset(makeSpecimen())

    expect(dataset.name).toBe('volume')
    expect(dataset.defaultSelection).toEqual({ c: 1, t: 2 })
    expect(dataset.dimensions).toEqual([{ name: 'c', size: 2 }, { name: 't', size: 3 }])
    expect(dataset.channels.map((channel) => channel.label)).toEqual(['DAPI', 'GFP'])
    expect(dataset.channels.map((channel) => channel.color)).toEqual(['#00FF00', '#0000FF'])
    // Physical space from finest-level shape × scale ([10,20,30] × [2,2,4]).
    expect(dataset.physical.spatial.size).toEqual([20, 40, 120])
    // The raw parsed OME-Zarr metadata stays available as a domain getter.
    expect(dataset.volumeInfo?.omeVersion).toBe('0.5')
    expect(dataset.volumeInfo?.dtype).toBe('uint16')
  })

  it('carries per-source contrast windows on the plane resources', async () => {
    const dataset = await openCereviDataset(makeSpecimen())

    expect(dataset.volumeResource().channels.map((channel) => channel.contrast))
      .toEqual([[0.1, 0.9], [0, 1]])
    // Plane stores contribute their own omero windows, normalized per channel.
    for (const plane of SLICE_PLANES) {
      expect(dataset.planeResource(plane).channels.map((channel) => channel.contrast))
        .toEqual([[0.2, 0.8], [0, 1]])
      // Resource-specific metadata: the plane store's own selection defaults.
      expect(dataset.planeResource(plane).defaultSelection).toEqual({ c: 1, t: 2 })
      expect(dataset.planeResource(plane).info.sourceUrl).toBe(`/data/${plane}.zarr`)
    }
  })

  it('exposes a URL-backed mesh resource without fetching geometry', async () => {
    const dataset = await openCereviDataset(makeMeshSpecimen())

    const mesh = dataset.meshResource()
    expect(mesh).toMatchObject({
      id: 'mesh',
      kind: 'mesh',
      source: '/data/mesh.obj',
      downsampleFactor: 4,
      initialRegion: '42',
    })
    expect(mesh?.geometry).toBeUndefined()
    expect(dataset.resource('mesh')).toBe(mesh)
  })

  it('has no mesh resource when the specimen has no mesh variants', async () => {
    const dataset = await openCereviDataset(makeSpecimen())

    expect(dataset.meshResource()).toBeUndefined()
    expect(dataset.resources.map((resource) => resource.id)).not.toContain('mesh')
  })

  it('builds layers that consume the resources of the one dataset instance', async () => {
    const dataset = await openCereviDataset(makeSpecimen())

    const layers = buildLayers(dataset)
    const volume = layers.find((layer) => layer.id === 'volume')
    expect(volume?.data?.fetch).toBe(dataset.volumeResource().fetch)
    expect(volume?.data?.pyramid).toBe(dataset.volumeResource().pyramid)
    // Nested selection: the volume's defaultSelection is spread and only the
    // channel index `c` is overridden — other dims (t) pass through untouched.
    const selection = (volume?.options as { selection?: Record<string, number> } | undefined)?.selection
    expect(selection).toEqual({ ...dataset.defaultSelection, c: 1 })

    // Each slice layer reads its precomputed plane resource by stable id (the
    // xy view reads the "plane-xz" source under RAS/xyz).
    const sliceXY = layers.find((layer) => layer.id === 'sliceXY')
    expect(sliceXY?.data?.fetch).toBe(dataset.planeResource('xz').fetch)
    expect(sliceXY?.data?.pyramid).toBe(dataset.planeResource('xz').pyramid)
    const sliceYZ = layers.find((layer) => layer.id === 'sliceYZ')
    expect(sliceYZ?.data?.fetch).toBe(dataset.planeResource('yz').fetch)
  })

  it('owns the opened volume child and disposes it with the dataset', async () => {
    const dataset = await openCereviDataset(makeSpecimen())

    expect(openedChildren).toHaveLength(1)
    dataset.dispose()

    expect(openedChildren[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  it('disposes idempotently — the child is released exactly once', async () => {
    const dataset = await openCereviDataset(makeSpecimen())

    dataset.dispose()
    dataset.dispose()

    expect(openedChildren[0]!.dispose).toHaveBeenCalledTimes(1)
    expect(dataset.resources).toEqual([])
    expect(dataset.primaryResourceId).toBeUndefined()
  })

  it('disposes the opened volume child when a sibling plane open fails', async () => {
    mockFetch2DPlane.mockRejectedValue(new Error('plane boom'))

    await expect(openCereviDataset(makeSpecimen())).rejects.toThrow('plane boom')
    expect(openedChildren).toHaveLength(1)
    expect(openedChildren[0]!.dispose).toHaveBeenCalledTimes(1)
  })

  it('propagates volume open failures', async () => {
    mockOpenDataset.mockImplementation((config) =>
      config.type === 'cerevi-specimen'
        ? hoisted.actualOpenDataset(config)
        : Promise.reject(new Error('zarr boom')))

    await expect(openCereviDataset(makeSpecimen())).rejects.toThrow('zarr boom')
  })
})

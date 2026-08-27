/**
 * Specimen dataset — the `"cerevi-specimen"` galavi Dataset kind.
 *
 * `cereviSpecimen(specimen)` is the ONE parser from cerevi-server's
 * specimens.json `Specimen` shape to the portable JSON descriptor
 * ({@link CereviDatasetConfig}): `files`/`modes` interpretation, variant
 * selection, and `CereviAPI.dataUrl(...)` resolution all live here — view and
 * layer factories never parse specimens.json indices again.
 *
 * `CereviDataset` opens the volume OME-Zarr store plus the three precomputed
 * projection plane stores exactly once and exposes them as typed runtime
 * resources: the primary `"volume"` image, the stable-named
 * `"plane-xy"`/`"plane-xz"`/`"plane-yz"` images, and an optional URL-backed
 * `"mesh"`. The dataset owns every child data resource; `dispose()` releases
 * them (idempotently).
 */

import {
  Dataset,
  openDataset,
  registerDatasetAdapter,
  type DatasetConfig,
  type DatasetResource,
  type ImagePyramidResource,
  type MeshResource,
  type PhysicalSpace,
} from 'galavi'
import { buildContrastLimits, type AxisMap } from 'galavi'
import {
  fetch2DPlane,
  getPhysicalSpace,
  type OMEZarrDataset,
  type OMEZarrInfo,
  type Plane2D,
} from 'galavi/ome-zarr'
import {
  buildSliceOrientations,
  parseAnatomicalOrientation,
  type OrientedSlicePlane,
  type SlicePlane,
} from '@/lib/anatomical-orientation'
import type { DataMode, ImageMetadata, MeshMetadata, Specimen } from '@/types'
import CereviAPI from '@/services/api'

// ============================================================================
// DESCRIPTOR — the portable JSON identity of one specimen's data
// ============================================================================

/**
 * Declarative config for the `"cerevi-specimen"` dataset kind — pure JSON
 * (survives `JSON.parse(JSON.stringify(...))` unchanged). Source URLs are
 * absolute or app-resolvable; the raw orientation strings are preserved so
 * the runtime dataset derives axis maps and storage reversals from them.
 * Runtime values (Axios instances, callbacks, open Datasets, fetch functions,
 * DOM, Pinia state) never appear here.
 */
export interface CereviDatasetConfig {
  type: 'cerevi-specimen'
  /** Specimen ID from specimens.json. */
  id: string
  /** Display name from specimens.json. */
  name: string
  image: {
    /** Volume image store (an `"ome-zarr"` dataset config). */
    volume: DatasetConfig
    /** Precomputed projection plane stores, keyed by their storage plane. */
    planes: Record<'xy' | 'xz' | 'yz', DatasetConfig>
    /** Raw RAS-style direction string (e.g. `"RAS"`). */
    ras: string
    /** Raw storage axis permutation (e.g. `"xyz"`). */
    axesOrder: string
  }
  mesh?: {
    /** Mesh source URL (fetched by the surface layer, not at open time). */
    source: string
    downsampleFactor?: number
    initialRegion?: string
  }
}

declare module 'galavi' {
  interface DatasetConfigMap {
    /** Cerevi specimen: one OME-Zarr volume + three precomputed planes + optional mesh. */
    'cerevi-specimen': CereviDatasetConfig
  }
}

/**
 * One precomputed projection plane source as a runtime resource: the
 * pyramid/fetch pair plus the axis map of the anatomical view it feeds, its
 * own physical space, per-source channel contrast, and the raw parsed OME
 * metadata of its store.
 */
export interface CereviPlaneResource extends ImagePyramidResource {
  /** `[u, v, slice] -> storage axes` of the anatomical view this source feeds. */
  axisMap: AxisMap
  /** Raw parsed OME metadata of the precomputed plane store. */
  info: OMEZarrInfo
}

/** The specimen's mesh as a URL-backed resource (geometry is NOT preloaded). */
export interface CereviMeshResource extends MeshResource {
  downsampleFactor?: number
  initialRegion?: string
}

// ============================================================================
// PARSER — Specimen -> CereviDatasetConfig (the only specimens.json reader)
// ============================================================================

function modeFile(metadata: ImageMetadata | MeshMetadata, mode: DataMode, owner: string): string {
  const fileIndex = metadata.modes?.[mode]?.[0]?.[0]
  const file = fileIndex === undefined ? undefined : metadata.files?.[fileIndex]
  if (!file) throw new Error(`${owner} has no ${mode} source`)
  return file
}

/**
 * Build the portable descriptor for one specimen. Throws with the specimen
 * and variant names when the image versions, orientation metadata, mode
 * sources, or mesh metadata are missing — before any source is opened.
 */
export function cereviSpecimen(specimen: Specimen): CereviDatasetConfig {
  const imageVersion = Object.keys(specimen.image ?? {})[0]
  const imageMetadata = imageVersion ? specimen.image?.[imageVersion] : undefined
  if (!imageVersion || !imageMetadata) {
    throw new Error(`Specimen ${specimen.id} has no image versions`)
  }
  if (!imageMetadata.RAS_coordinate || !imageMetadata.axes_order) {
    throw new Error(`Specimen ${specimen.id} image ${imageVersion} has no orientation metadata`)
  }
  const imageSource = (mode: DataMode) => CereviAPI.dataUrl(modeFile(imageMetadata, mode, imageVersion))
  const config: CereviDatasetConfig = {
    type: 'cerevi-specimen',
    id: specimen.id,
    name: specimen.name,
    image: {
      volume: { type: 'ome-zarr', source: imageSource('3d') },
      planes: {
        xy: { type: 'ome-zarr', source: imageSource('xy') },
        xz: { type: 'ome-zarr', source: imageSource('xz') },
        yz: { type: 'ome-zarr', source: imageSource('yz') },
      },
      ras: imageMetadata.RAS_coordinate,
      axesOrder: imageMetadata.axes_order,
    },
  }

  const hasMesh = Boolean(specimen.mesh && Object.keys(specimen.mesh).length > 0)
  if (hasMesh) {
    const meshVersion = Object.keys(specimen.mesh ?? {})[0]
    const meshMetadata = meshVersion ? specimen.mesh?.[meshVersion] : undefined
    if (!meshVersion || !meshMetadata) {
      throw new Error(`Specimen ${specimen.id} has invalid mesh metadata`)
    }
    const initialRegion = String(meshMetadata.modes?.['3d']?.[0]?.[2]?.[0] ?? '')
    config.mesh = {
      source: CereviAPI.dataUrl(modeFile(meshMetadata, '3d', meshVersion)),
      ...(meshMetadata.downsample_factor !== undefined
        ? { downsampleFactor: meshMetadata.downsample_factor }
        : {}),
      ...(initialRegion ? { initialRegion } : {}),
    }
  }
  return config
}

// ============================================================================
// DATASET — the runtime "cerevi-specimen" kind
// ============================================================================

/** Validate a child image config and return its OME-Zarr source URL. */
function omeZarrSource(config: DatasetConfig, owner: string): string {
  if (config.type !== 'ome-zarr') {
    throw new Error(`${owner} must be an "ome-zarr" dataset config, got "${config.type}"`)
  }
  return config.source
}

/**
 * CereviDataset — one specimen opened as a galavi Dataset. Base metadata
 * (`name`, `physical`, `channels`, `dimensions`, `defaultSelection`) comes
 * from the volume child dataset; the resources carry everything
 * source-specific (per-plane physical space, axis map, selection defaults,
 * per-source channel contrast, raw OME info). Parsed orientation is exposed
 * as domain data (`sliceOrientations`, `storageReversed`); factories consume
 * the normalized resources through the typed getters rather than reaching
 * into child datasets.
 */
export class CereviDataset extends Dataset {
  declare readonly config: CereviDatasetConfig
  /** Physical space of the volume (always set by `load()`). */
  declare physical: PhysicalSpace

  /** Parsed per-plane orientation derived from the raw RAS/axes-order strings. */
  readonly sliceOrientations: Record<SlicePlane, OrientedSlicePlane>
  /** Whether canonical display order runs opposite to storage along [x, y, z]. */
  readonly storageReversed: [boolean, boolean, boolean]

  private _volume?: Dataset
  private _disposed = false

  constructor(config: CereviDatasetConfig) {
    super(config)
    const image = config.image
    if (!image || typeof image.ras !== 'string' || typeof image.axesOrder !== 'string') {
      throw new Error(
        `Specimen ${config.id}: cerevi-specimen config requires image.ras and image.axesOrder strings`,
      )
    }
    this.sliceOrientations = buildSliceOrientations(image.ras, image.axesOrder)
    const anatomical = parseAnatomicalOrientation(image.ras, image.axesOrder)
    const reversed: [boolean, boolean, boolean] = [false, false, false]
    for (const axis of Object.values(anatomical)) {
      reversed[axis.storageAxis] = axis.sign === 1
    }
    this.storageReversed = reversed
  }

  /** Specimen ID this dataset was opened from. */
  get specimenId(): string {
    return this.config.id
  }

  /** Raw parsed OME-Zarr metadata of the volume store (undefined until loaded). */
  get volumeInfo(): OMEZarrInfo | undefined {
    return (this._volume as OMEZarrDataset | undefined)?.info
  }

  /** The primary volume image resource. */
  volumeResource(): ImagePyramidResource {
    const resource = this.resource('image-pyramid', 'volume')
    if (!resource) {
      throw new Error(`Specimen ${this.config.id}: dataset has no "volume" image resource`)
    }
    return resource
  }

  /** One named precomputed plane image resource (`"plane-xy"` etc.). */
  planeResource(plane: SlicePlane): CereviPlaneResource {
    const resource = this.resource('image-pyramid', `plane-${plane}`)
    if (!resource) {
      throw new Error(`Specimen ${this.config.id}: dataset has no "plane-${plane}" image resource`)
    }
    return resource as CereviPlaneResource
  }

  /** The URL-backed mesh resource, when the specimen has mesh variants. */
  meshResource(): CereviMeshResource | undefined {
    return this.resource('mesh') as CereviMeshResource | undefined
  }

  /**
   * Open the volume store and the three precomputed plane stores in parallel,
   * exactly once. A failed open disposes every child that completed.
   */
  override async load(): Promise<void> {
    const image = this.config.image
    // Validate every child config before any open, so a malformed descriptor
    // never leaves a partial open behind.
    omeZarrSource(image.volume, `Specimen ${this.config.id}: image.volume`)
    const planeSources: Record<SlicePlane, string> = {
      xy: omeZarrSource(image.planes.xy, `Specimen ${this.config.id}: image.planes.xy`),
      xz: omeZarrSource(image.planes.xz, `Specimen ${this.config.id}: image.planes.xz`),
      yz: omeZarrSource(image.planes.yz, `Specimen ${this.config.id}: image.planes.yz`),
    }
    // Each precomputed plane store is read through the axis map of the
    // anatomical view that consumes it.
    const axisMapForSource = (sourcePlane: SlicePlane): AxisMap => {
      const orientation = Object.values(this.sliceOrientations)
        .find((entry) => entry.sourcePlane === sourcePlane)
      if (!orientation) {
        throw new Error(`Specimen ${this.config.id}: no anatomical view uses ${sourcePlane} source`)
      }
      return orientation.axisMap
    }

    const volumeOpen = openDataset(image.volume)
    let volume: Dataset
    let planes: Record<SlicePlane, Plane2D>
    try {
      const [openedVolume, xyPlane, xzPlane, yzPlane] = await Promise.all([
        volumeOpen,
        fetch2DPlane(planeSources.xy, axisMapForSource('xy')),
        fetch2DPlane(planeSources.xz, axisMapForSource('xz')),
        fetch2DPlane(planeSources.yz, axisMapForSource('yz')),
      ])
      volume = openedVolume
      planes = { xy: xyPlane, xz: xzPlane, yz: yzPlane }
      const volumeImage = volume.resource('image-pyramid')
      const volumePhysical = volume.physical
      if (!volumeImage || !volumePhysical) {
        throw new Error(
          `Specimen ${this.config.id}: volume dataset (kind "${volume.type}") has no ` +
          'image-pyramid resource with a physical space',
        )
      }
      this.populate(volume, volumeImage, volumePhysical, planes, axisMapForSource)
    } catch (err) {
      // The open failed after (or while) the volume child opened — release the
      // child this dataset would have owned instead of leaking it.
      await volumeOpen.then((child) => child.dispose(), () => {})
      throw err
    }
    this._volume = volume
  }

  private populate(
    volume: Dataset,
    volumeImage: ImagePyramidResource,
    physical: PhysicalSpace,
    planes: Record<SlicePlane, Plane2D>,
    axisMapForSource: (sourcePlane: SlicePlane) => AxisMap,
  ): void {
    this.name = volume.name
    this.physical = physical
    this.channels = volume.channels
    this.dimensions = volume.dimensions
    this.defaultSelection = volume.defaultSelection

    const channelCount = Math.max(1, volume.channels.length)
    const planeResource = (plane: SlicePlane, data: Plane2D): CereviPlaneResource => {
      const contrast = buildContrastLimits(data.info.omeroChannelContrastLimits, channelCount)
      return {
        id: `plane-${plane}`,
        kind: 'image-pyramid',
        pyramid: data.pyramid,
        // Plane2D.fetch requires its options bag while a resource fetch may be
        // called without one — default it so the types line up.
        fetch: (options) => data.fetch(options ?? {}),
        physical: getPhysicalSpace(data.info),
        dimensions: data.info.selectionDims.map((dim) => ({
          name: dim.name,
          size: dim.size,
          ...(dim.labels ? { labels: [...dim.labels] } : {}),
        })),
        defaultSelection: { ...data.info.defaultSelection },
        // Normalized channels of the volume with THIS source's contrast windows.
        channels: volume.channels.map((channel, index) => ({
          ...channel,
          contrast: contrast[index] ?? channel.contrast,
        })),
        axisMap: axisMapForSource(plane),
        info: data.info,
      }
    }

    const meshConfig = this.config.mesh
    const mesh: CereviMeshResource | undefined = meshConfig
      ? {
          id: 'mesh',
          kind: 'mesh',
          source: meshConfig.source,
          ...(meshConfig.downsampleFactor !== undefined
            ? { downsampleFactor: meshConfig.downsampleFactor }
            : {}),
          ...(meshConfig.initialRegion ? { initialRegion: meshConfig.initialRegion } : {}),
        }
      : undefined

    const resources: DatasetResource[] = [
      { ...volumeImage, id: 'volume' },
      planeResource('xy', planes.xy),
      planeResource('xz', planes.xz),
      planeResource('yz', planes.yz),
      ...(mesh ? [mesh] : []),
    ]
    // Assign resources before primaryResourceId — the setters validate.
    this.resources = resources
    this.primaryResourceId = 'volume'
  }

  /** Release the owned volume child dataset. Idempotent. */
  override dispose(): void {
    if (this._disposed) return
    this._disposed = true
    this._volume?.dispose()
    this._volume = undefined
    // Clear primaryResourceId before resources — the setters validate.
    this.primaryResourceId = undefined
    this.resources = []
  }
}

/**
 * Open one specimen AS a loaded {@link CereviDataset} (typed narrowing over
 * `openDataset`). The returned instance is CALLER-OWNED — dispose it when the
 * specimen changes or the viewer route tears down.
 */
export async function openCereviDataset(specimen: Specimen): Promise<CereviDataset> {
  const dataset = await openDataset(cereviSpecimen(specimen))
  if (!(dataset instanceof CereviDataset)) {
    dataset.dispose()
    throw new Error(
      `openDataset("cerevi-specimen") returned a "${dataset.type}" dataset — ` +
      'the cerevi-specimen kind registration was replaced',
    )
  }
  return dataset
}

registerDatasetAdapter('cerevi-specimen', (config) => new CereviDataset(config))

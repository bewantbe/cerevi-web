/**
 * Setup context — slice axis definitions plus the per-specimen SetupContext
 * assembled from OME-Zarr metadata (split from src/galavi-setup.ts).
 */

import {
  buildContrastLimits,
  getChannelColor,
  type AxisMap,
  type Vec2,
} from 'galavi'
import {
  openOMEZarr,
  fetch2DPlane,
  type OMEZarrInfo,
  type Plane2D,
} from '@galavi/ome-zarr-adapter'
import {
  buildSliceOrientations,
  parseAnatomicalOrientation,
  type SlicePlane as OrientationSlicePlane,
  type StorageAxisName,
} from '@/lib/anatomical-orientation'
import type { DataMode, ImageMetadata, MeshMetadata, Specimen } from '@/types'
import CereviAPI from '@/services/api'

// ============================================================================
// SLICE AXIS DEFINITIONS
// ============================================================================

export type SlicePlane = OrientationSlicePlane

export interface SliceDef {
  key: SlicePlane
  axes: [StorageAxisName, StorageAxisName]
  /** axisMap[2] = which spatial axis (0=x,1=y,2=z) the slice index walks along. */
  axisMap: AxisMap
  sourcePlane: SlicePlane
  /** Whether canonical display order runs opposite to storage along [u,v,slice]. */
  reversed: [boolean, boolean, boolean]
  layerId: string
  regionShapesId: string
  anatomicalLabel: string
}

export const SLICE_PLANES: SlicePlane[] = ['xy', 'yz', 'xz']

const SLICE_PRESENTATION: Record<SlicePlane, Pick<SliceDef, 'layerId' | 'regionShapesId' | 'anatomicalLabel'>> = {
  xy: { layerId: 'sliceXY', regionShapesId: 'regionShapesXY', anatomicalLabel: 'Coronal' },
  yz: { layerId: 'sliceYZ', regionShapesId: 'regionShapesYZ', anatomicalLabel: 'Sagittal' },
  xz: { layerId: 'sliceXZ', regionShapesId: 'regionShapesXZ', anatomicalLabel: 'Horizontal' },
}

// ============================================================================
// SETUP CONTEXT (built per-specimen from OME-Zarr metadata)
// ============================================================================

export interface ChannelInfo {
  index: number
  label: string
  color: string
}

export type ImagerySource = 'volume' | SlicePlane
export type ImageryContrastLimits = Record<ImagerySource, Vec2[]>

export interface SetupContext {
  specimenId: string
  volumeInfo: OMEZarrInfo
  sliceDefs: Record<SlicePlane, SliceDef>
  storageReversed: [boolean, boolean, boolean]
  /** Precomputed projection sources keyed by their storage plane. */
  sliceSources: Record<'xy' | 'xz' | 'yz', Plane2D>
  imageryContrastLimits: ImageryContrastLimits
  initCh: number
  channelCount: number
  channels: ChannelInfo[]
  hasMesh: boolean
  meshUrl: string
  meshDownsampleFactor: number | null
  initRegion: string
}

function findChannelDim(info: OMEZarrInfo): { count: number; init: number } {
  const c = info.selectionDims.find((d) => d.name === 'c')
  if (!c) return { count: 1, init: 0 }
  return { count: c.size, init: info.defaultSelection.c ?? 0 }
}

function buildChannels(volumeInfo: OMEZarrInfo, count: number): ChannelInfo[] {
  const labels = volumeInfo.omeroChannelLabels ?? []
  const channelDim = volumeInfo.selectionDims.find((dimension) => dimension.name === 'c')
  const colors = volumeInfo.omeroChannelColors ?? []

  return Array.from({ length: count }, (_, index) => ({
    index,
    label: labels[index] ?? channelDim?.labels?.[index] ?? `Channel ${index}`,
    color: getChannelColor(index, colors[index]),
  }))
}

/** Display color for a channel — metadata color when valid, palette fallback otherwise. */
export function channelColor(ctx: SetupContext, channel: number): string {
  return ctx.channels[channel]?.color ?? getChannelColor(channel)
}

function modeFile(metadata: ImageMetadata | MeshMetadata, mode: DataMode, owner: string): string {
  const fileIndex = metadata.modes?.[mode]?.[0]?.[0]
  const file = fileIndex === undefined ? undefined : metadata.files?.[fileIndex]
  if (!file) throw new Error(`${owner} has no ${mode} source`)
  return file
}

export async function buildSetupContext(specimen: Specimen): Promise<SetupContext> {
  const imageVersion = Object.keys(specimen.image ?? {})[0]
  const imageMetadata = imageVersion ? specimen.image?.[imageVersion] : undefined
  if (!imageVersion || !imageMetadata) {
    throw new Error(`Specimen ${specimen.id} has no image versions`);
  }
  if (!imageMetadata.RAS_coordinate || !imageMetadata.axes_order) {
    throw new Error(`Specimen ${specimen.id} image ${imageVersion} has no orientation metadata`)
  }
  const sliceOrientations = buildSliceOrientations(
    imageMetadata.RAS_coordinate,
    imageMetadata.axes_order,
  )
  const sliceDefs = Object.fromEntries(SLICE_PLANES.map((plane) => [plane, {
    key: plane,
    ...sliceOrientations[plane],
    ...SLICE_PRESENTATION[plane],
  }])) as Record<SlicePlane, SliceDef>
  const anatomicalOrientation = parseAnatomicalOrientation(
    imageMetadata.RAS_coordinate,
    imageMetadata.axes_order,
  )
  const storageReversed: [boolean, boolean, boolean] = [false, false, false]
  for (const axis of Object.values(anatomicalOrientation)) {
    storageReversed[axis.storageAxis] = axis.sign === 1
  }
  const volumeUrl = CereviAPI.dataUrl(modeFile(imageMetadata, '3d', imageVersion))
  const xyUrl = CereviAPI.dataUrl(modeFile(imageMetadata, 'xy', imageVersion))
  const xzUrl = CereviAPI.dataUrl(modeFile(imageMetadata, 'xz', imageVersion))
  const yzUrl = CereviAPI.dataUrl(modeFile(imageMetadata, 'yz', imageVersion))
  const definitionForSource = (sourcePlane: SlicePlane) => {
    const definition = Object.values(sliceDefs).find((entry) => entry.sourcePlane === sourcePlane)
    if (!definition) throw new Error(`No anatomical view uses ${sourcePlane} source`)
    return definition
  }
  const [volumeInfo, xyPlane, xzPlane, yzPlane] = await Promise.all([
    openOMEZarr(volumeUrl),
    fetch2DPlane(xyUrl, definitionForSource('xy').axisMap),
    fetch2DPlane(xzUrl, definitionForSource('xz').axisMap),
    fetch2DPlane(yzUrl, definitionForSource('yz').axisMap),
  ])
  const sliceSources = { xy: xyPlane, xz: xzPlane, yz: yzPlane }
  const ch = findChannelDim(volumeInfo)
  const imageryContrastLimits: ImageryContrastLimits = {
    volume: buildContrastLimits(volumeInfo.omeroChannelContrastLimits, ch.count),
    xy: buildContrastLimits(sliceSources.xy.info.omeroChannelContrastLimits, ch.count),
    xz: buildContrastLimits(sliceSources.xz.info.omeroChannelContrastLimits, ch.count),
    yz: buildContrastLimits(sliceSources.yz.info.omeroChannelContrastLimits, ch.count),
  }

  let meshDownsampleFactor = null;
  let meshUrl = '';
  let initRegion = '';
  const hasMesh = Boolean(specimen.mesh && Object.keys(specimen.mesh).length > 0);
  if (hasMesh) {
    const meshVersion = Object.keys(specimen.mesh ?? {})[0];
    const meshMetadata = meshVersion ? specimen.mesh?.[meshVersion] : undefined
    if (!meshVersion || !meshMetadata) throw new Error(`Specimen ${specimen.id} has invalid mesh metadata`)
    meshDownsampleFactor = meshVersion
      ? (meshMetadata.downsample_factor ?? null)
      : null;
    meshUrl = CereviAPI.dataUrl(modeFile(meshMetadata, '3d', meshVersion));
    initRegion = String(meshMetadata.modes?.['3d']?.[0]?.[2]?.[0] ?? '');
  }

  return {
    specimenId: specimen.id,
    volumeInfo,
    sliceDefs,
    storageReversed,
    sliceSources,
    imageryContrastLimits,
    initCh: ch.init,
    channelCount: ch.count,
    channels: buildChannels(volumeInfo, ch.count),
    hasMesh,
    meshUrl,
    meshDownsampleFactor,
    initRegion,
  }
}

export function planeLabel(plane: SlicePlane): string {
  return `${SLICE_PRESENTATION[plane].anatomicalLabel} (${plane.toUpperCase()})`
}

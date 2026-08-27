/**
 * Slice geometry — slice plane definitions, channel/contrast accessors, and
 * physical-space transforms over a loaded CereviDataset. The dataset owns the
 * raw sources and parsed orientation; this module adds the composition-level
 * presentation (layer IDs, anatomical labels) and coordinate math.
 */

import {
  cameraDistance,
  clampContrastLimits,
  fitSliceCamera as fitGalaviSliceCamera,
  getChannelColor,
  type AxisMap,
  type Data,
  type Vec2,
  type Vec3,
} from 'galavi'
import {
  canonicalToStorageIndex,
  type SlicePlane as OrientationSlicePlane,
  type StorageAxisName,
} from '@/lib/anatomical-orientation'
import type { CereviDataset, CereviPlaneResource } from './specimen-dataset'

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

/** The full slice definition for one plane: dataset orientation + presentation. */
export function sliceDef(dataset: CereviDataset, plane: SlicePlane): SliceDef {
  return { key: plane, ...dataset.sliceOrientations[plane], ...SLICE_PRESENTATION[plane] }
}

export function planeLabel(plane: SlicePlane): string {
  return `${SLICE_PRESENTATION[plane].anatomicalLabel} (${plane.toUpperCase()})`
}

// ============================================================================
// IMAGERY SOURCES — volume + precomputed planes, with per-source contrast
// ============================================================================

export type ImagerySource = 'volume' | SlicePlane
export type ImageryContrastLimits = Record<ImagerySource, Vec2[]>

/** The precomputed plane resource feeding an anatomical view. */
export function sliceSource(dataset: CereviDataset, plane: SlicePlane): CereviPlaneResource {
  return dataset.planeResource(sliceDef(dataset, plane).sourcePlane)
}

export function imagerySourceForPlane(dataset: CereviDataset, plane: SlicePlane): SlicePlane {
  return sliceDef(dataset, plane).sourcePlane
}

/** Per-source channel contrast windows, straight off the dataset's resources. */
export function buildImageryContrastLimits(dataset: CereviDataset): ImageryContrastLimits {
  return {
    volume: dataset.channels.map((channel) => channel.contrast),
    xy: dataset.planeResource('xy').channels.map((channel) => channel.contrast),
    xz: dataset.planeResource('xz').channels.map((channel) => channel.contrast),
    yz: dataset.planeResource('yz').channels.map((channel) => channel.contrast),
  }
}

export function contrastLimitsForSource(
  dataset: CereviDataset,
  source: ImagerySource,
  channel: number,
): Vec2 {
  const channels = source === 'volume' ? dataset.channels : dataset.planeResource(source).channels
  return clampContrastLimits(channels[channel]?.contrast)
}

export function contrastLimitsForPlane(dataset: CereviDataset, plane: SlicePlane, channel: number): Vec2 {
  return contrastLimitsForSource(dataset, imagerySourceForPlane(dataset, plane), channel)
}

/** Display color for a channel — metadata color when valid, palette fallback otherwise. */
export function channelColor(dataset: CereviDataset, channel: number): string {
  return dataset.channels[channel]?.color ?? getChannelColor(channel)
}

/** The dataset's initial channel (the volume's default `c` selection). */
export function initialChannel(dataset: CereviDataset): number {
  return dataset.defaultSelection.c ?? 0
}

// ============================================================================
// SLICE INDEXING
// ============================================================================

export function sliceCount(dataset: CereviDataset, plane: SlicePlane): number {
  const definition = sliceDef(dataset, plane)
  return sliceSource(dataset, plane).pyramid.levels[0].shape[definition.axisMap[2]]
}

export function initialSlice(dataset: CereviDataset, plane: SlicePlane): number {
  return Math.floor(sliceCount(dataset, plane) / 2)
}

export function storageSliceIndex(dataset: CereviDataset, plane: SlicePlane, index: number): number {
  return canonicalToStorageIndex(index, sliceCount(dataset, plane), sliceDef(dataset, plane).reversed[2])
}

// ============================================================================
// PHYSICAL SPACE — framing and oriented transforms
// ============================================================================

function spatial(dataset: CereviDataset) {
  return dataset.physical.spatial
}

function spatialOrigin(dataset: CereviDataset): Vec3 {
  return (spatial(dataset).origin ?? [0, 0, 0]) as Vec3
}

export function physicalFraming(dataset: CereviDataset): {
  size: Vec3
  center: Vec3
  maxExtent: number
  unit: string
} {
  const size = [...spatial(dataset).size] as Vec3
  const origin = spatialOrigin(dataset)
  const center = origin.map((value, axis) => value + size[axis] / 2) as Vec3
  return {
    size,
    center,
    maxExtent: Math.max(...size),
    unit: spatial(dataset).unit ?? 'μm',
  }
}

function affine(scale: Vec3, translate: Vec3): number[] {
  return [
    scale[0], 0, 0, 0,
    0, scale[1], 0, 0,
    0, 0, scale[2], 0,
    translate[0], translate[1], translate[2], 1,
  ]
}

export function orientedVolumeTransform(dataset: CereviDataset): number[] {
  const { size } = physicalFraming(dataset)
  const origin = spatialOrigin(dataset)
  const scale = size.map((extent, axis) => dataset.storageReversed[axis] ? -extent : extent) as Vec3
  const translate = origin.map((value, axis) => value + (dataset.storageReversed[axis] ? size[axis] : 0)) as Vec3
  return affine(scale, translate)
}

export function sliceData(dataset: CereviDataset, plane: SlicePlane): Data {
  const definition = sliceDef(dataset, plane)
  const source = sliceSource(dataset, plane)
  const { size } = physicalFraming(dataset)
  const origin = spatialOrigin(dataset)
  const uAxis = definition.axisMap[0]
  const vAxis = definition.axisMap[1]
  const scale: Vec3 = [
    definition.reversed[0] ? -size[uAxis] : size[uAxis],
    definition.reversed[1] ? -size[vAxis] : size[vAxis],
    1,
  ]
  const translate: Vec3 = [
    origin[uAxis] + (definition.reversed[0] ? size[uAxis] : 0),
    origin[vAxis] + (definition.reversed[1] ? size[vAxis] : 0),
    0,
  ]
  return {
    fetch: source.fetch,
    pyramid: source.pyramid,
    transform: affine(scale, translate),
  }
}

export function fitSliceCamera(dataset: CereviDataset, plane: SlicePlane): {
  target: Vec3
  position: Vec3
  distance: number
} {
  const definition = sliceDef(dataset, plane)
  const camera = fitGalaviSliceCamera(definition.axisMap, dataset.physical)
  return { target: camera.target, position: camera.position, distance: cameraDistance(camera) }
}

/**
 * Slice geometry — pure context accessors and physical-space transforms
 * derived from a SetupContext (split from src/galavi-setup.ts).
 */

import {
  cameraDistance,
  clampContrastLimits,
  fitSliceCamera as fitGalaviSliceCamera,
  type Data,
  type Vec2,
  type Vec3,
} from 'galavi/advanced'
import type { Plane2D } from 'galavi/ome-zarr'
import { canonicalToStorageIndex } from '@/lib/anatomical-orientation'
import type { ImagerySource, SetupContext, SliceDef, SlicePlane } from './context'

export function sliceDef(ctx: SetupContext, plane: SlicePlane): SliceDef {
  return ctx.sliceDefs[plane]
}

export function sliceSource(ctx: SetupContext, plane: SlicePlane): Plane2D {
  return ctx.sliceSources[sliceDef(ctx, plane).sourcePlane]
}

export function imagerySourceForPlane(ctx: SetupContext, plane: SlicePlane): SlicePlane {
  return sliceDef(ctx, plane).sourcePlane
}

export function contrastLimitsForSource(
  ctx: SetupContext,
  source: ImagerySource,
  channel: number,
): Vec2 {
  return clampContrastLimits(ctx.imageryContrastLimits[source]?.[channel])
}

export function contrastLimitsForPlane(ctx: SetupContext, plane: SlicePlane, channel: number): Vec2 {
  return contrastLimitsForSource(ctx, imagerySourceForPlane(ctx, plane), channel)
}

export function sliceCount(ctx: SetupContext, plane: SlicePlane): number {
  const definition = sliceDef(ctx, plane)
  return sliceSource(ctx, plane).pyramid.levels[0].shape[definition.axisMap[2]]
}

export function initialSlice(ctx: SetupContext, plane: SlicePlane): number {
  return Math.floor(sliceCount(ctx, plane) / 2)
}

export function storageSliceIndex(ctx: SetupContext, plane: SlicePlane, index: number): number {
  return canonicalToStorageIndex(index, sliceCount(ctx, plane), sliceDef(ctx, plane).reversed[2])
}

/** The volume dataset's physical space (set once the opened dataset has loaded). */
function spatial(ctx: SetupContext) {
  return ctx.dataset.physical.spatial
}

function spatialOrigin(ctx: SetupContext): Vec3 {
  return (spatial(ctx).origin ?? [0, 0, 0]) as Vec3
}

export function physicalFraming(ctx: SetupContext): {
  size: Vec3
  center: Vec3
  maxExtent: number
  unit: string
} {
  const size = [...spatial(ctx).size] as Vec3
  const origin = spatialOrigin(ctx)
  const center = origin.map((value, axis) => value + size[axis] / 2) as Vec3
  return {
    size,
    center,
    maxExtent: Math.max(...size),
    unit: spatial(ctx).unit ?? 'μm',
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

export function orientedVolumeTransform(ctx: SetupContext): number[] {
  const { size } = physicalFraming(ctx)
  const origin = spatialOrigin(ctx)
  const scale = size.map((extent, axis) => ctx.storageReversed[axis] ? -extent : extent) as Vec3
  const translate = origin.map((value, axis) => value + (ctx.storageReversed[axis] ? size[axis] : 0)) as Vec3
  return affine(scale, translate)
}

export function sliceData(ctx: SetupContext, plane: SlicePlane): Data {
  const definition = sliceDef(ctx, plane)
  const source = sliceSource(ctx, plane)
  const { size } = physicalFraming(ctx)
  const origin = spatialOrigin(ctx)
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
    // Plane2D.fetch requires its options bag while galavi's Data.fetch may be
    // called without one — default it so the types line up.
    fetch: (options) => source.fetch(options ?? {}),
    pyramid: source.pyramid,
    transform: affine(scale, translate),
  }
}

export function fitSliceCamera(ctx: SetupContext, plane: SlicePlane): {
  target: Vec3
  position: Vec3
  distance: number
} {
  const definition = sliceDef(ctx, plane)
  const camera = fitGalaviSliceCamera(definition.axisMap, ctx.dataset.physical)
  return { target: camera.target, position: camera.position, distance: cameraDistance(camera) }
}

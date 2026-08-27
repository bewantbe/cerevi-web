/**
 * Coordinate helpers — pure conversions between physical positions, slice
 * indices, and selection boxes, parameterized on a loaded CereviDataset
 * (extracted from the visor store; app-local, not part of galavi).
 */

import type { AxisMap, Vec3 } from 'galavi'
import type { CereviDataset } from '@/galavi/specimen-dataset'
import type { SlicePlane } from '@/galavi/slice-geometry'
import { physicalFraming, sliceCount, sliceDef, sliceSource } from '@/galavi/slice-geometry'

export interface PhysicalSelection {
  min: Vec3
  max: Vec3
}

/** Axis-aligned physical bounds of the volume. */
export function physicalBounds(ctx: CereviDataset): PhysicalSelection {
  const { center, size } = physicalFraming(ctx)
  return {
    min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
    max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
  }
}

export function clampPosition(bounds: PhysicalSelection, position: Vec3): Vec3 {
  return position.map((value, axis) => Math.max(bounds.min[axis], Math.min(bounds.max[axis], value))) as Vec3
}

/** Slice index whose voxel-center plane is nearest to the physical position. */
export function sliceForPosition(ctx: CereviDataset, slicePlane: SlicePlane, position: Vec3): number {
  const axis = sliceDef(ctx, slicePlane).axisMap[2]
  const count = Math.max(1, sliceCount(ctx, slicePlane))
  const source = sliceSource(ctx, slicePlane)
  const origin = source.info.origin[axis]
  const scale = source.pyramid.levels[0].scale[axis]
  const index = scale > 0 ? Math.round((position[axis] - origin) / scale - 0.5) : 0
  return Math.max(0, Math.min(count - 1, index))
}

/** Physical position of a slice index's voxel-center plane. */
export function positionForSlice(ctx: CereviDataset, slicePlane: SlicePlane, index: number): number {
  const axis = sliceDef(ctx, slicePlane).axisMap[2]
  const count = Math.max(1, sliceCount(ctx, slicePlane))
  const clamped = Math.max(0, Math.min(count - 1, Math.round(index)))
  const source = sliceSource(ctx, slicePlane)
  const origin = source.info.origin[axis]
  const scale = source.pyramid.levels[0].scale[axis]
  if (scale > 0) return origin + (clamped + 0.5) * scale
  return physicalFraming(ctx).center[axis]
}

/**
 * Give a flat (zero-depth) in-plane selection a default depth along the
 * slice axis: the longest in-plane side, centered on the slice position and
 * clamped into the volume bounds.
 */
export function withDefaultSelectionDepth(
  selection    : PhysicalSelection,
  axisMap      : AxisMap,
  slicePosition: number,
  bounds       : PhysicalSelection,
): PhysicalSelection {
  const next = { min: [...selection.min] as Vec3, max: [...selection.max] as Vec3 }
  const u = axisMap[0]
  const v = axisMap[1]
  const depthAxis = axisMap[2]
  const longestSide = Math.max(
    Math.abs(selection.max[u] - selection.min[u]),
    Math.abs(selection.max[v] - selection.min[v]),
  )
  const depth = Math.min(longestSide, bounds.max[depthAxis] - bounds.min[depthAxis])
  let min = slicePosition - depth / 2
  let max = slicePosition + depth / 2
  if (min < bounds.min[depthAxis]) {
    min = bounds.min[depthAxis]
    max = min + depth
  }
  if (max > bounds.max[depthAxis]) {
    max = bounds.max[depthAxis]
    min = max - depth
  }
  next.min[depthAxis] = min
  next.max[depthAxis] = max
  return next
}

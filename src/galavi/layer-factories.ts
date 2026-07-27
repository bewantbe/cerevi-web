/**
 * Layer factories — galavi LayerConfig literals for the volume, slice,
 * surface, and region-overlay layers (split from src/galavi-setup.ts).
 */

import { getPhysicalSpace } from '@galavi/ome-zarr-adapter'
import type { LayerConfig, Vec3 } from 'galavi'
import { SLICE_PLANES, channelColor, type SetupContext, type SliceDef } from './context'
import {
  contrastLimitsForPlane,
  contrastLimitsForSource,
  initialSlice,
  orientedVolumeTransform,
  sliceData,
  sliceDef,
  sliceSource,
  storageSliceIndex,
} from './slice-geometry'

function makeVolumeLayer(ctx: SetupContext): LayerConfig {
  const info = ctx.volumeInfo
  return {
    id: 'volume',
    type: 'volume',
    data: { fetch: info.fetchTile, pyramid: info.pyramid, transform: orientedVolumeTransform(ctx) },
    options: {
      selection: { ...info.defaultSelection, c: ctx.initCh },
    },
    render: {
      visible: true,
      color: channelColor(ctx, ctx.initCh),
      contrastLimits: contrastLimitsForSource(ctx, 'volume', ctx.initCh),
      blending: 'additive',
    },
  }
}

export function sliceChannelLayerId(def: SliceDef, channelIndex: number): string {
  return `${def.layerId}:c${channelIndex}`
}

export function sliceLayerIds(ctx: SetupContext, def: SliceDef, composeChannels: boolean): string[] {
  return composeChannels
    ? ctx.channels.map((channel) => sliceChannelLayerId(def, channel.index))
    : [def.layerId]
}

function makeSliceLayer(
  def: SliceDef,
  ctx: SetupContext,
  channelIndex = ctx.initCh,
  layerId = def.layerId,
): LayerConfig {
  // Each slice mode renders from its own precomputed projection slice source
  // (the selected specimens.json image variant paths[1..3] for xy/xz/yz). The slices are
  // stored separately for performance: their slice axis indexes precomputed
  // projection planes (one per ~20um stride in upstream voxels), and only
  // the in-plane axes downsample with pyramid level. The adapter's 2D plane
  // fetcher (fetch2DPlane) reads exactly one plane per request and packs it
  // into the u-fastest 2D layout the slice layer's r16float texture expects.
  const source = sliceSource(ctx, def.key)
  const info = source.info
  const initialSliceIndex = initialSlice(ctx, def.key)
  return {
    id: layerId,
    type: 'slice',
    data: sliceData(ctx, def.key),
    options: {
      axes: def.axes,
      sliceIndex: storageSliceIndex(ctx, def.key, initialSliceIndex),
      selection: { ...info.defaultSelection, c: channelIndex },
    },
    render: {
      visible: true,
      color: channelColor(ctx, channelIndex),
      contrastLimits: contrastLimitsForPlane(ctx, def.key, channelIndex),
      blending: 'additive',
    },
  }
}

export function makeMeshDataSize(ctx: SetupContext): Vec3 {
  const phys = getPhysicalSpace(ctx.volumeInfo).spatial.size;
  const downsampleFactor = ctx.meshDownsampleFactor && ctx.meshDownsampleFactor > 0
    ? ctx.meshDownsampleFactor
    : 1;
  return [
    phys[0] / downsampleFactor,
    phys[1] / downsampleFactor,
    phys[2] / downsampleFactor,
  ]
}

function makeSurfaceLayer(ctx: SetupContext): LayerConfig {
  // Mesh OBJs are exported in a specimen-specific downsampled local frame.
  // Galavi rescales the mesh into the shared physical space using `dataSize`.
  const meshSize = makeMeshDataSize(ctx)
  return {
    id: 'surface',
    type: 'surface',
    data: { url: ctx.meshUrl, transform: orientedVolumeTransform(ctx) },
    options: { dataSize: meshSize },
    render: {
      color: channelColor(ctx, ctx.initCh),
      opacity: 0.8,
      wireframe: false,
      doubleSided: true,
      shading: 'xray',
    },
  }
}

function makeRegionSurfaceLayer(ctx: SetupContext): LayerConfig {
  const meshSize = makeMeshDataSize(ctx)
  return {
    id: 'regionSurface',
    type: 'surface',
    data: { url: ctx.meshUrl, transform: orientedVolumeTransform(ctx) },
    options: { dataSize: meshSize, regionLabel: ctx.initRegion },
    render: {
      visible: false,
      color: channelColor(ctx, ctx.initCh),
      opacity: 0.6,
      wireframe: false,
      doubleSided: true,
      shading: 'xray',
    },
  }
}

// Galavi's slice view renders meshes through ImagePipeline with a 2D ortho
// camera (near/far = ±1) — surface layers don't draw anything visible there.
// To show the mesh's intersection with the slice plane, use a sibling
// `shapes` layer with `surfaceSourceId` pointing at the surface layer; the
// library auto-intersects mesh ↔ plane each frame and renders the contour
// as a line-list. The surface layer must still appear in the view's `layers`
// so the shapes layer can find it via siblings (its draw is a no-op).
function makeRegionShapesLayer(def: SliceDef, ctx: SetupContext): LayerConfig {
  return {
    id: def.regionShapesId,
    type: 'shapes',
    options: {
      axes: def.axes,
      surfaceSourceId: 'regionSurface',
    },
    render: {
      visible: false,
      color: channelColor(ctx, ctx.initCh),
      opacity: 0.9,
    },
  }
}

export function buildLayers(ctx: SetupContext, composeSliceChannels = false): LayerConfig[] {
  const layers: LayerConfig[] = [makeVolumeLayer(ctx)]
  if (ctx.hasMesh) layers.push(makeSurfaceLayer(ctx))
  for (const plane of SLICE_PLANES) {
    const def = sliceDef(ctx, plane)
    if (composeSliceChannels) {
      layers.push(...ctx.channels.map((channel) => makeSliceLayer(
        def,
        ctx,
        channel.index,
        sliceChannelLayerId(def, channel.index),
      )))
    } else {
      layers.push(makeSliceLayer(def, ctx))
    }
  }
  if (ctx.hasMesh) {
    layers.push(makeRegionSurfaceLayer(ctx))
    layers.push(...SLICE_PLANES.map((plane) => makeRegionShapesLayer(sliceDef(ctx, plane), ctx)))
  }
  return layers
}

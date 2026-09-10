/**
 * Layer factories — galavi LayerConfig literals for the volume, slice,
 * surface, and region-overlay layers, built from a loaded CereviDataset's
 * resources (never from array positions or child datasets).
 */

import type { LayerConfig, Vec3 } from 'galavi'
import type { CereviDataset, CereviMeshResource } from './specimen-dataset'
import {
  SLICE_PLANES,
  channelColor,
  contrastLimitsForPlane,
  contrastLimitsForSource,
  initialChannel,
  initialSlice,
  orientedVolumeTransform,
  sliceData,
  sliceDef,
  sliceSource,
  storageSliceIndex,
  type SliceDef,
} from './slice-geometry'

function makeVolumeLayer(dataset: CereviDataset): LayerConfig {
  // The runtime pyramid/fetch pair comes from the dataset's primary
  // image-pyramid resource (the normalized Dataset data contract).
  const image = dataset.volumeResource()
  const channel = initialChannel(dataset)
  return {
    id: 'volume',
    type: 'volume',
    data: { fetch: image.fetch, pyramid: image.pyramid, transform: orientedVolumeTransform(dataset) },
    options: {
      selection: { ...dataset.defaultSelection, c: channel },
    },
    render: {
      visible: true,
      color: channelColor(dataset, channel),
      contrastLimits: contrastLimitsForSource(dataset, 'volume', channel),
      blending: 'additive',
    },
  }
}

export function sliceChannelLayerId(def: SliceDef, channelIndex: number): string {
  return `${def.layerId}:c${channelIndex}`
}

export function sliceLayerIds(dataset: CereviDataset, def: SliceDef, composeChannels: boolean): string[] {
  return composeChannels
    ? dataset.channels.map((channel) => sliceChannelLayerId(def, channel.index))
    : [def.layerId]
}

function makeSliceLayer(
  def: SliceDef,
  dataset: CereviDataset,
  channelIndex = initialChannel(dataset),
  layerId = def.layerId,
): LayerConfig {
  // Each slice mode renders from its own precomputed projection plane
  // resource (the "plane-xy"/"plane-xz"/"plane-yz" resources). The slices are
  // stored separately for performance: their slice axis indexes precomputed
  // projection planes (one per ~20um stride in upstream voxels), and only
  // the in-plane axes downsample with pyramid level. The adapter's 2D plane
  // fetcher (fetch2DPlane, wrapped by the dataset) reads exactly one plane
  // per request and packs it into the u-fastest 2D layout the slice layer's
  // r16float texture expects.
  const source = sliceSource(dataset, def.key)
  const initialSliceIndex = initialSlice(dataset, def.key)
  return {
    id: layerId,
    type: 'slice',
    data: sliceData(dataset, def.key),
    options: {
      axes: def.axes,
      sliceIndex: storageSliceIndex(dataset, def.key, initialSliceIndex),
      selection: { ...source.defaultSelection, c: channelIndex },
    },
    render: {
      visible: true,
      color: channelColor(dataset, channelIndex),
      contrastLimits: contrastLimitsForPlane(dataset, def.key, channelIndex),
      blending: 'additive',
    },
  }
}

export function makeMeshDataSize(dataset: CereviDataset): Vec3 {
  const phys = dataset.physical.spatial.size;
  const factor = dataset.meshResource()?.downsampleFactor
  const downsampleFactor = factor && factor > 0 ? factor : 1;
  return [
    phys[0] / downsampleFactor,
    phys[1] / downsampleFactor,
    phys[2] / downsampleFactor,
  ]
}

function makeSurfaceLayer(dataset: CereviDataset, mesh: CereviMeshResource): LayerConfig {
  // Mesh OBJs are exported in a specimen-specific downsampled local frame.
  // Galavi rescales the mesh into the shared physical space using `dataSize`.
  const meshSize = makeMeshDataSize(dataset)
  const channel = initialChannel(dataset)
  return {
    id: 'surface',
    type: 'surface',
    data: { url: mesh.source, transform: orientedVolumeTransform(dataset) },
    options: { dataSize: meshSize },
    render: {
      color: channelColor(dataset, channel),
      opacity: 0.8,
      wireframe: false,
      doubleSided: true,
      shading: 'xray',
    },
  }
}

function makeRegionSurfaceLayer(dataset: CereviDataset, mesh: CereviMeshResource): LayerConfig {
  const meshSize = makeMeshDataSize(dataset)
  const channel = initialChannel(dataset)
  return {
    id: 'regionSurface',
    type: 'surface',
    data: { url: mesh.source, transform: orientedVolumeTransform(dataset) },
    options: { dataSize: meshSize, regionLabel: mesh.initialRegion ?? '' },
    render: {
      visible: false,
      color: channelColor(dataset, channel),
      opacity: 0.6,
      wireframe: false,
      doubleSided: true,
      shading: 'xray',
    },
  }
}

// Galavi's slice view renders meshes through ViewPipeline with a 2D ortho
// camera (near/far = ±1) — surface layers don't draw anything visible there.
// To show the mesh's intersection with the slice plane, use a sibling
// `shapes` layer with `surfaceSourceId` pointing at the surface layer; the
// library auto-intersects mesh ↔ plane each frame and renders the contour
// as a line-list. The surface layer must still appear in the view's `layers`
// so the shapes layer can find it via siblings (its draw is a no-op).
function makeRegionShapesLayer(def: SliceDef, dataset: CereviDataset): LayerConfig {
  return {
    id: def.regionShapesId,
    type: 'shapes',
    options: {
      axes: def.axes,
      surfaceSourceId: 'regionSurface',
    },
    render: {
      visible: false,
      color: channelColor(dataset, initialChannel(dataset)),
      opacity: 0.9,
    },
  }
}

export function buildLayers(dataset: CereviDataset, composeSliceChannels = false): LayerConfig[] {
  const mesh = dataset.meshResource()
  const layers: LayerConfig[] = [makeVolumeLayer(dataset)]
  if (mesh) layers.push(makeSurfaceLayer(dataset, mesh))
  for (const plane of SLICE_PLANES) {
    const def = sliceDef(dataset, plane)
    if (composeSliceChannels) {
      layers.push(...dataset.channels.map((channel) => makeSliceLayer(
        def,
        dataset,
        channel.index,
        sliceChannelLayerId(def, channel.index),
      )))
    } else {
      layers.push(makeSliceLayer(def, dataset))
    }
  }
  if (mesh) {
    layers.push(makeRegionSurfaceLayer(dataset, mesh))
    layers.push(...SLICE_PLANES.map((plane) => makeRegionShapesLayer(sliceDef(dataset, plane), dataset)))
  }
  return layers
}

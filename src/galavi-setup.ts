/**
 * Galavi setup for cerevi-web — OME-Zarr backed.
 *
 * Loads the specimen's volume OME-Zarr v0.5 group via @galavi/ome-zarr-adapter
 * and synthesizes three slice views from the same volume (no separate projn
 * zarrs). Surface and region overlays are loaded from cerevi-server's mesh
 * endpoint when available.
 */

import {
  buildSliceOrientations,
  canonicalToStorageIndex,
  clampContrastLimits,
  createGalavi,
  getChannelColor,
  parseAnatomicalOrientation,
  buildContrastLimits,
  type AxisMap,
  type Galavi,
  type LayerConfig,
  type SlicePlane as OrientationSlicePlane,
  type State,
  type StorageAxisName,
  type ViewConfig,
  type Vec2,
  type Vec3,
} from 'galavi'
import {
  openOMEZarr,
  getVolumeTransform,
  getPhysicalSpace,
  fetch2DPlane,
  type OMEZarrInfo,
  type Plane2D,
} from '@galavi/ome-zarr-adapter'
import type { DataMode, ImageMetadata, MeshMetadata, Specimen } from '@/types'
import VISoRAPI from '@/services/api'

const INITIAL_CAMERA_DISTANCE_FACTOR = 1.5

const vec2 = (a: number, b: number): Vec2 => [a, b]
const vec3 = (a: number, b: number, c: number): Vec3 => [a, b, c]

export type ViewName = 'volume' | 'navigator' | 'xy' | 'yz' | 'xz' | 'none'
export type ConfiguredViewName = Exclude<ViewName, 'none'>
type ViewTemplate = Omit<ViewConfig, 'canvas'>

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
  const volumeUrl = VISoRAPI.dataUrl(modeFile(imageMetadata, '3d', imageVersion))
  const xyUrl = VISoRAPI.dataUrl(modeFile(imageMetadata, 'xy', imageVersion))
  const xzUrl = VISoRAPI.dataUrl(modeFile(imageMetadata, 'xz', imageVersion))
  const yzUrl = VISoRAPI.dataUrl(modeFile(imageMetadata, 'yz', imageVersion))
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
    meshUrl = VISoRAPI.dataUrl(modeFile(meshMetadata, '3d', meshVersion));
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

export function sliceDef(ctx: SetupContext, plane: SlicePlane): SliceDef {
  return ctx.sliceDefs[plane]
}

export function planeLabel(plane: SlicePlane): string {
  return `${SLICE_PRESENTATION[plane].anatomicalLabel} (${plane.toUpperCase()})`
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

export function physicalFraming(ctx: SetupContext): {
  size: Vec3
  center: Vec3
  maxExtent: number
  unit: string
} {
  const volume = getVolumeTransform(ctx.volumeInfo)
  const space = getPhysicalSpace(ctx.volumeInfo)
  return {
    size: space.spatial.size as Vec3,
    center: volume.center as Vec3,
    maxExtent: volume.maxExtent,
    unit: space.spatial.unit ?? 'μm',
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
  const origin = (getPhysicalSpace(ctx.volumeInfo).spatial.origin ?? [0, 0, 0]) as Vec3
  const scale = size.map((extent, axis) => ctx.storageReversed[axis] ? -extent : extent) as Vec3
  const translate = origin.map((value, axis) => value + (ctx.storageReversed[axis] ? size[axis] : 0)) as Vec3
  return affine(scale, translate)
}

export function sliceData(ctx: SetupContext, plane: SlicePlane) {
  const definition = sliceDef(ctx, plane)
  const source = sliceSource(ctx, plane)
  const { size } = physicalFraming(ctx)
  const origin = (getPhysicalSpace(ctx.volumeInfo).spatial.origin ?? [0, 0, 0]) as Vec3
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
  return { fetch: source.fetch, pyramid: source.pyramid, transform: affine(scale, translate) }
}

export function fitSliceCamera(ctx: SetupContext, plane: SlicePlane): {
  target: Vec3
  position: Vec3
  distance: number
} {
  const definition = sliceDef(ctx, plane)
  const { size, center } = physicalFraming(ctx)
  const distance = Math.max(size[definition.axisMap[0]], size[definition.axisMap[1]], 1e-6)
  const target = [...center] as Vec3
  const position = [...center] as Vec3
  position[definition.axisMap[2]] += distance
  return { target, position, distance }
}

// ============================================================================
// LAYER FACTORIES
// ============================================================================

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
  } as LayerConfig
}

function makeSliceLayer(def: SliceDef, ctx: SetupContext): LayerConfig {
  // Each slice mode renders from its own precomputed projection slice source
  // (the selected specimens.json image variant paths[1..3] for xy/xz/yz). The slices are
  // stored separately for performance: their slice axis indexes precomputed
  // projection planes (one per ~20um stride in upstream voxels), and only
  // the in-plane axes downsample with pyramid level. The adapter's 2D plane
  // fetcher (fetch2DPlane) reads exactly one plane per request and packs it
  // into the u-fastest 2D layout the slice layer's r16float texture expects.
  const source = sliceSource(ctx, def.key)
  const info = source.info
  const sliceAxis = def.axisMap[2]
  const initialSliceIndex = initialSlice(ctx, def.key)
  return {
    id: def.layerId,
    type: 'slice',
    data: sliceData(ctx, def.key),
    options: {
      axes: def.axes,
      sliceIndex: storageSliceIndex(ctx, def.key, initialSliceIndex),
      selection: { ...info.defaultSelection, c: ctx.initCh },
    },
    render: {
      visible: true,
      color: channelColor(ctx, ctx.initCh),
      contrastLimits: contrastLimitsForPlane(ctx, def.key, ctx.initCh),
      blending: 'additive',
    },
  } as LayerConfig
}

function makeMeshDataSize(ctx: SetupContext): Vec3 {
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
  } as LayerConfig
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
  } as LayerConfig
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
  } as LayerConfig
}

function buildLayers(ctx: SetupContext): LayerConfig[] {
  const layers: LayerConfig[] = [makeVolumeLayer(ctx)]
  if (ctx.hasMesh) layers.push(makeSurfaceLayer(ctx))
  layers.push(...SLICE_PLANES.map((plane) => makeSliceLayer(sliceDef(ctx, plane), ctx)))
  if (ctx.hasMesh) {
    layers.push(makeRegionSurfaceLayer(ctx))
    layers.push(...SLICE_PLANES.map((plane) => makeRegionShapesLayer(sliceDef(ctx, plane), ctx)))
  }
  return layers
}

// ============================================================================
// VIEW CONFIG FACTORY
// ============================================================================

function buildViewConfigs(ctx: SetupContext): Record<ConfiguredViewName, ViewTemplate> {
  const hasMeshLayers = ctx.hasMesh
  const configs: Record<string, ViewTemplate> = {
    volume: {
      type: 'volume',
      layers: hasMeshLayers ? ['volume', 'regionSurface'] : ['volume'],
      controls: { orbit: {}, fly: {} },
      autoRotate: true,
      overlays: {
        // Tools are hidden until the store wires visibility via setOverlayOptions.
        roiselector: { enabled: false },
        ruler: { visible: false },
        magnifier: { visible: false },
      },
      label: '3D Volume',
      activatable: true,
    },
    navigator: {
      type: 'navigator',
      layers: hasMeshLayers ? ['surface'] : ['volume'],
      overlays: {
        // 3-axis reticle at the camera target (replaces the old planes layer).
        crosshair: {},
      },
      label: 'Navigator',
      activatable: false,
    },
  }

  for (const plane of SLICE_PLANES) {
    const def = sliceDef(ctx, plane)
    configs[def.key] = {
      type: 'slice',
      // `regionSurface` is included so the per-axis `regionShapes*` shapes
      // layer can resolve it via `surfaceSourceId` and intersect it with the
      // current slice plane. The surface layer itself doesn't draw anything
      // useful in slice views (galavi's slice ortho camera clips meshes), but
      // the OBJ is downloaded once and reused as the geometry source.
      layers: hasMeshLayers ? [def.layerId, 'regionSurface', def.regionShapesId] : [def.layerId],
      controls: { panzoom: {} },
      overlays: {
        // Tools are hidden until the store wires visibility via setOverlayOptions.
        crosshair: { visible: false },
        ruler: { visible: false },
        roiselector: { visible: false, enabled: false },
        magnifier: { visible: false },
      },
      label: `${def.anatomicalLabel} (${def.key.toUpperCase()})`,
      activatable: true,
    }
  }

  return configs as Record<ConfiguredViewName, ViewTemplate>
}

// ============================================================================
// SESSION STATE
// ============================================================================

function buildSessionState(ctx: SetupContext): State {
  const vol = getVolumeTransform(ctx.volumeInfo)
  const physical = getPhysicalSpace(ctx.volumeInfo)
  const distance = vol.maxExtent * INITIAL_CAMERA_DISTANCE_FACTOR

  return {
    exploration: {
      camera: {
        navMode: 'orbit',
        projMode: 'perspective',
        position: [
          vol.center[0] + distance * Math.cos(-0.4) * Math.sin(0.5),
          vol.center[1] + distance * Math.sin(-0.4),
          vol.center[2] + distance * Math.cos(-0.4) * Math.cos(0.5),
        ],
        target: vol.center,
      },
    },
    physical,
    layers: buildLayers(ctx),
  }
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

export function isConfiguredViewName(name: ViewName): name is ConfiguredViewName {
  return name !== 'none'
}

export async function bootstrap(
  ctx: SetupContext,
  mainCanvas: HTMLCanvasElement,
  sideCanvases: Record<string, HTMLCanvasElement>,
  mainViewName: ConfiguredViewName,
  sideViewNames: ConfiguredViewName[],
): Promise<Galavi> {
  const sessionState = buildSessionState(ctx)
  const configs = buildViewConfigs(ctx)

  const views: Record<string, ViewConfig> = {
    ...configs,
    [mainViewName]: { ...configs[mainViewName], canvas: mainCanvas },
    ...Object.fromEntries(
      sideViewNames
        .filter((name) => sideCanvases[name])
        .map((name) => [name, { ...configs[name], canvas: sideCanvases[name] }]),
    ),
  }

  return createGalavi({ state: sessionState, views })
}

// ============================================================================
// STANDALONE VIEW BUILDERS
// Small one-off Galavi instances outside the bootstrapped multi-view session:
// slice thumbnails/previews and the mesh navigator overview. Shared by
// SliceMode, QuadrantMode, and SliceNavigator (dissolved from the old
// src/galavi/gallery.ts module, D7).
// ============================================================================

export interface BuildSliceViewerOptions {
  ctx: SetupContext
  plane: SlicePlane
  channel: number | null
  color?: string
  contrastLimits?: Vec2
  sliceIndex: number
  canvas: HTMLCanvasElement
}

/** Non-interactive single-channel slice view on its own canvas (thumbnails, slider previews, navigator fallback). */
export async function buildSliceViewer(options: BuildSliceViewerOptions): Promise<Galavi> {
  const { ctx, plane, color, contrastLimits, sliceIndex, canvas } = options
  const definition = sliceDef(ctx, plane)
  const source = sliceSource(ctx, plane)
  const channel = options.channel ?? source.info.defaultSelection.c ?? 0
  const fit = fitSliceCamera(ctx, plane)
  const { size, unit } = physicalFraming(ctx)
  const layer: LayerConfig = {
    id: 'slice',
    type: 'slice',
    data: sliceData(ctx, plane),
    options: {
      axes: definition.axes,
      sliceIndex: storageSliceIndex(ctx, plane, sliceIndex),
      selection: { ...source.info.defaultSelection, c: channel },
    },
    render: {
      visible: options.channel !== null,
      ...(color ? { color } : { colormap: 'gray' }),
      contrastLimits: contrastLimits ?? contrastLimitsForPlane(ctx, plane, channel),
      blending: 'additive',
    },
  } as LayerConfig
  const view: ViewConfig = {
    type: 'slice',
    canvas,
    layers: ['slice'],
    activatable: false,
  }
  const state: State = {
    physical: { spatial: { size, unit } },
    layers: [layer],
    exploration: {
      camera: {
        navMode: 'fly',
        projMode: 'orthographic',
        position: fit.position,
        target: fit.target,
      },
    },
  }
  return createGalavi({ state, views: { main: view } })
}

/** Camera pull-back factor for the mesh navigator overview (relative to maxExtent). */
export const NAVIGATOR_DISTANCE_FACTOR = 1.55

function navigatorCamera(ctx: SetupContext, plane: SlicePlane): { position: Vec3; target: Vec3; up: Vec3 } {
  const { center, maxExtent } = physicalFraming(ctx)
  const distance = maxExtent * NAVIGATOR_DISTANCE_FACTOR
  const [, upAxis, sliceAxis] = sliceDef(ctx, plane).axisMap
  const up: Vec3 = [0, 0, 0]
  up[upAxis] = 1
  const sliceDirection: Vec3 = [0, 0, 0]
  sliceDirection[sliceAxis] = 1
  const forward: Vec3 = [
    up[1] * sliceDirection[2] - up[2] * sliceDirection[1],
    up[2] * sliceDirection[0] - up[0] * sliceDirection[2],
    up[0] * sliceDirection[1] - up[1] * sliceDirection[0],
  ]
  return {
    position: center.map((value, axis) => value - forward[axis] * distance) as Vec3,
    target: center,
    up,
  }
}

function sliceNavigatorCamera(ctx: SetupContext, plane: SlicePlane): { position: Vec3; target: Vec3; up: Vec3 } {
  const { center, maxExtent } = physicalFraming(ctx)
  const distance = maxExtent * NAVIGATOR_DISTANCE_FACTOR
  let forward: Vec3
  let up: Vec3
  if (plane === 'yz') {
    const [anteriorAxis, dorsalAxis] = sliceDef(ctx, 'yz').axisMap
    forward = [0, 0, 0]
    forward[dorsalAxis] = 1
    up = [0, 0, 0]
    up[anteriorAxis] = 1
  } else {
    const [, dorsalAxis, anteriorAxis] = sliceDef(ctx, 'xy').axisMap
    up = [0, 0, 0]
    up[dorsalAxis] = 1
    const posterior: Vec3 = [0, 0, 0]
    posterior[anteriorAxis] = 1
    forward = [
      up[1] * posterior[2] - up[2] * posterior[1],
      up[2] * posterior[0] - up[0] * posterior[2],
      up[0] * posterior[1] - up[1] * posterior[0],
    ]
  }

  return {
    position: center.map((value, axis) => value - forward[axis] * distance) as Vec3,
    target: center,
    up,
  }
}

export interface BuildNavigatorOptions {
  ctx: SetupContext
  plane: SlicePlane
  canvas: HTMLCanvasElement
  channel?: number | null
  color?: string
  cameraMode?: 'active-plane' | 'slice-view'
}

/** Small 3D overview: the specimen mesh, or a fallback slice view when no mesh exists. */
export async function buildNavigatorOverview(options: BuildNavigatorOptions): Promise<Galavi> {
  const { ctx, plane, canvas } = options
  const channel = options.channel === undefined ? ctx.initCh : options.channel

  if (!ctx.hasMesh || ctx.meshDownsampleFactor === null) {
    const fallbackPlane: SlicePlane = plane === 'xy' ? 'xz' : plane === 'yz' ? 'xy' : 'yz'
    return buildSliceViewer({
      ctx,
      plane: fallbackPlane,
      channel,
      color: options.color,
      sliceIndex: initialSlice(ctx, fallbackPlane),
      canvas,
    })
  }

  const { size, unit } = physicalFraming(ctx)
  const meshSize = makeMeshDataSize(ctx)
  const camera = options.cameraMode === 'slice-view'
    ? sliceNavigatorCamera(ctx, plane)
    : navigatorCamera(ctx, plane)

  const layers: LayerConfig[] = [
    {
      id: 'surface',
      type: 'surface',
      data: { url: ctx.meshUrl, transform: orientedVolumeTransform(ctx) },
      options: { dataSize: meshSize },
      render: {
        color: options.color ?? '#C7CCD6',
        opacity: 0.88,
        wireframe: false,
        doubleSided: true,
        shading: 'xray',
      },
    } as LayerConfig,
  ]

  const view: ViewConfig = {
    type: 'volume',
    canvas,
    layers: ['surface'],
    activatable: false,
  }

  const state: State = {
    physical: { spatial: { size, unit } },
    layers,
    exploration: {
      camera: {
        navMode: 'fly',
        projMode: 'perspective',
        position: camera.position,
        target: camera.target,
        up: camera.up,
      },
    },
  }

  return createGalavi({ state, views: { main: view } })
}

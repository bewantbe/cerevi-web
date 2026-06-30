/**
 * Galavi setup for cerevi-web — OME-Zarr backed.
 *
 * Loads the specimen's volume OME-Zarr v0.5 group via @galavi/ome-zarr-adapter
 * and synthesizes three slice views from the same volume (no separate projn
 * zarrs). Surface and region overlays are loaded from cerevi-server's mesh
 * endpoint when available.
 */

import {
  createGalavi,
  type Galavi,
  type LayerConfig,
  type State,
  type ViewConfig,
  type Vec2,
  type Vec3,
} from 'galavi'
import {
  openOMEZarr,
  getVolumeTransform,
  getPhysicalSpace,
  type OMEZarrInfo,
} from '@galavi/ome-zarr-adapter'
import { openSlice, type Slice, type SliceAxis } from '@/openSlice'
import type { Specimen } from '@/types'
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

export interface SliceDef {
  key: string
  axes: [string, string]
  /** axisMap[2] = which spatial axis (0=x,1=y,2=z) the slice index walks along. */
  axisMap: Vec3
  layerId: string
  regionShapesId: string
  anatomicalLabel: string
}

export const SLICE_DEFS: SliceDef[] = [
  { key: 'xy', axes: ['x', 'y'], axisMap: vec3(0, 1, 2), layerId: 'sliceXY', regionShapesId: 'regionShapesXY', anatomicalLabel: 'Coronal' },
  { key: 'yz', axes: ['y', 'z'], axisMap: vec3(1, 2, 0), layerId: 'sliceYZ', regionShapesId: 'regionShapesYZ', anatomicalLabel: 'Sagittal' },
  { key: 'xz', axes: ['x', 'z'], axisMap: vec3(0, 2, 1), layerId: 'sliceXZ', regionShapesId: 'regionShapesXZ', anatomicalLabel: 'Horizontal' },
]

export const REGION_DATA_IDS = [
  'regionSurface',
  ...SLICE_DEFS.map((s) => s.regionShapesId),
]

export const IMAGERY_IDS = ['volume', ...SLICE_DEFS.map((s) => s.layerId)]

// ============================================================================
// SETUP CONTEXT (built per-specimen from OME-Zarr metadata)
// ============================================================================

export interface SetupContext {
  specimenId: string
  volumeInfo: OMEZarrInfo
  /** Per-mode precomputed projection slice sources (visor-specific). */
  sliceSources: Record<'xy' | 'xz' | 'yz', Slice>
  conRange: Vec2
  /**
   * Per-imagery-layer autoContrast (from each source's omero.window).
   * Keys are layer ids (`volume`, `sliceXY`, `sliceXZ`, `sliceYZ`).
   * Used by useSliceState to scale the global slider per-layer so that the
    * 3D volume (mean-downsampled, dimmer) and the 2D slices (max-projected,
   * brighter) share a single slider that maps to each layer's own intended
   * display range. Without this, applying a uniform `[lo,hi]` to all layers
    * makes slices blow out white when 3D looks correct, or 3D black when
    * slices look correct.
   */
  imageryAutoContrast: Record<string, Vec2>
  initCh: number
  channelCount: number
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

export async function buildSetupContext(specimen: any): Promise<SetupContext> {
  const imageVersion = Object.keys(specimen['image'])[0]
  if (!imageVersion) {
    throw new Error(`Specimen ${specimen.id} has no image versions`);
  }
  const imageFiles = specimen['image'][imageVersion]['files'];
  const imageModes = specimen['image'][imageVersion]['modes'];
  const volumeUrl = VISoRAPI.dataUrl(imageFiles[imageModes['3d'][0][0]])
  const xyUrl = VISoRAPI.dataUrl(imageFiles[imageModes['xy'][0][0]])
  const xzUrl = VISoRAPI.dataUrl(imageFiles[imageModes['xz'][0][0]])
  const yzUrl = VISoRAPI.dataUrl(imageFiles[imageModes['yz'][0][0]])
  // sliceAxis (in [x, y, z] order): xy ⇒ z=2, xz ⇒ y=1, yz ⇒ x=0.
  const [volumeInfo, xySlice, xzSlice, yzSlice] = await Promise.all([
    openOMEZarr(volumeUrl),
    openSlice(xyUrl, 2 as SliceAxis),
    openSlice(xzUrl, 1 as SliceAxis),
    openSlice(yzUrl, 0 as SliceAxis),
  ])
  const ch = findChannelDim(volumeInfo)
  // Per-layer autoContrast: each upstream zarr.json declares its own
  // omero.channels[0].window which the adapter normalizes into
  // OMEZarrInfo.autoContrast. The 3D volume and the 2D max-projection slices
  // legitimately need different display ranges (mean vs max sampling), so
  // we keep them separate and compose them downstream.
  const imageryAutoContrast: Record<string, Vec2> = {
    volume: [volumeInfo.autoContrast[0], volumeInfo.autoContrast[1]],
    sliceXY: [xySlice.info.autoContrast[0], xySlice.info.autoContrast[1]],
    sliceXZ: [xzSlice.info.autoContrast[0], xzSlice.info.autoContrast[1]],
    sliceYZ: [yzSlice.info.autoContrast[0], yzSlice.info.autoContrast[1]],
  }
  // Slider's reference range is the volume's autoContrast. Per-layer
  // contrastLimits at render time = sliderRange * (layerAuto / volumeAuto).
  const conRange: Vec2 = [volumeInfo.autoContrast[0], volumeInfo.autoContrast[1]]

  let meshDownsampleFactor = null;
  let meshUrl = '';
  let initRegion = '';
  const hasMesh = Boolean(
    specimen["mesh"] && Object.keys(specimen["mesh"]).length > 0,
  );
  if (hasMesh) {
    const meshVersion = Object.keys(specimen["mesh"])[0];
    meshDownsampleFactor = meshVersion
      ? (specimen["mesh"][meshVersion]["downsample_factor"] ?? null)
      : null;
    const meshFiles = specimen["mesh"][meshVersion]["files"];
    const meshModes = specimen["mesh"][meshVersion]["modes"];
    meshUrl = VISoRAPI.dataUrl(meshFiles[meshModes["3d"][0][0]]);
    initRegion = meshModes["3d"][0][2] ?? '';
  }

  return {
    specimenId: specimen.id,
    volumeInfo,
    sliceSources: { xy: xySlice, xz: xzSlice, yz: yzSlice },
    conRange,
    imageryAutoContrast,
    initCh: ch.init,
    channelCount: ch.count,
    hasMesh,
    meshUrl,
    meshDownsampleFactor,
    initRegion,
  }
}

// ============================================================================
// LEVEL RANGES
// ============================================================================

export function getViewLevelRange(viewName: string, ctx: SetupContext): Vec2 {
  if (viewName === 'xy' || viewName === 'xz' || viewName === 'yz') {
    return ctx.sliceSources[viewName].info.levelRange
  }
  return ctx.volumeInfo.levelRange
}

// ============================================================================
// LAYER FACTORIES
// ============================================================================

function makeVolumeLayer(ctx: SetupContext): LayerConfig {
  const info = ctx.volumeInfo
  return {
    id: 'volume',
    type: 'volume',
    data: { fetch: info.fetchTile },
    options: {
      dataSize: info.dataSize,
      levelScales: info.levelScales,
      levelRange: info.levelRange,
      tileSize: info.tileSize,
      selection: { ...info.defaultSelection, c: ctx.initCh },
    },
    render: {
      visible: true,
      colormap: 'gray',
      contrastLimits: ctx.imageryAutoContrast.volume,
      blending: 'additive',
    },
  } as LayerConfig
}

function makeSliceLayer(def: SliceDef, ctx: SetupContext): LayerConfig {
  // Each slice mode renders from its own precomputed projection slice source
  // (the selected specimens.json image variant paths[1..3] for xy/xz/yz). The slices are
  // stored separately for performance: their slice axis indexes precomputed
  // projection planes (one per ~20um stride in upstream voxels), and only
  // the in-plane axes downsample with pyramid level. A custom slice fetcher
  // (see openSlice.ts) reads exactly one plane per request and packs it into
  // the u-fastest 2D layout the slice layer's r16float texture expects.
  const sliceSource = ctx.sliceSources[def.key as 'xy' | 'xz' | 'yz']
  const info = sliceSource.info
  const sliceAxis = def.axisMap[2]
  const initialSliceIndex = Math.floor(info.dataSize[sliceAxis] / 2)
  const tileU = sliceSource.tileSize[def.axisMap[0]]
  const tileV = sliceSource.tileSize[def.axisMap[1]]
  return {
    id: def.layerId,
    type: 'slice',
    data: { fetch: sliceSource.fetch },
    options: {
      axes: def.axes,
      dataSize: info.dataSize,
      levelRange: info.levelRange,
      tileSize: [tileU, tileV],
      sliceIndex: initialSliceIndex,
      selection: { ...info.defaultSelection, c: ctx.initCh },
    },
    render: {
      visible: true,
      contrastLimits: ctx.imageryAutoContrast[def.layerId] ?? ctx.conRange,
      blending: 'additive',
    },
  } as LayerConfig
}

function makeMeshDataSize(ctx: SetupContext): Vec3 {
  const phys = getPhysicalSpace(ctx.volumeInfo).spatial.size;
  const downsampleFactor = ctx.meshDownsampleFactor ?? 1;
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
    data: { url: ctx.meshUrl },
    options: { dataSize: meshSize },
    render: {
      color: '#C0C5CE',
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
    data: { url: ctx.meshUrl },
    options: { dataSize: meshSize, regionLabel: ctx.initRegion },
    render: {
      visible: false,
      color: '#E63333',
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
function makeRegionShapesLayer(def: SliceDef): LayerConfig {
  return {
    id: def.regionShapesId,
    type: 'shapes',
    options: {
      axes: def.axes,
      surfaceSourceId: 'regionSurface',
    },
    render: {
      visible: false,
      color: '#E63333',
      opacity: 0.9,
    },
  } as LayerConfig
}

function buildLayers(ctx: SetupContext): LayerConfig[] {
  const layers: LayerConfig[] = [makeVolumeLayer(ctx)]
  if (ctx.hasMesh) layers.push(makeSurfaceLayer(ctx))
  layers.push(...SLICE_DEFS.map((def) => makeSliceLayer(def, ctx)))
  if (ctx.hasMesh) {
    layers.push(makeRegionSurfaceLayer(ctx))
    layers.push(...SLICE_DEFS.map((def) => makeRegionShapesLayer(def)))
  }
  return layers
}

// ============================================================================
// VIEW CONFIG FACTORY
// ============================================================================

function buildViewConfigs(hasMeshLayers = true): Record<ConfiguredViewName, ViewTemplate> {
  const configs: Record<string, ViewTemplate> = {
    volume: {
      type: 'volume',
      layers: hasMeshLayers ? ['volume', 'regionSurface'] : ['volume'],
      controls: { orbit: {}, fly: {}, resolution: {} },
      overlays: {
        scalebar: { visibleWhenActive: true, position: 'top-right' },
        text: { position: 'top-left', visibleWhenActive: true, regionDataIds: hasMeshLayers ? ['regionSurface'] : [] },
        marker: { visible: false, shape: 'dot', precision: 1, shapeSize: 12 },
      },
      label: '3D Volume',
      activatable: true,
    },
    navigator: {
      type: 'navigator',
      layers: hasMeshLayers ? ['surface'] : ['volume'],
      label: 'Navigator',
      activatable: false,
    },
  }

  for (const def of SLICE_DEFS) {
    configs[def.key] = {
      type: 'slice',
      // `regionSurface` is included so the per-axis `regionShapes*` shapes
      // layer can resolve it via `surfaceSourceId` and intersect it with the
      // current slice plane. The surface layer itself doesn't draw anything
      // useful in slice views (galavi's slice ortho camera clips meshes), but
      // the OBJ is downloaded once and reused as the geometry source.
      layers: hasMeshLayers ? [def.layerId, 'regionSurface', def.regionShapesId] : [def.layerId],
      controls: { panzoom: {}, resolution: {} },
      overlays: {
        scalebar: { visibleWhenActive: true, position: 'top-right' },
        text: { position: 'top-left', visibleWhenActive: true, regionDataIds: hasMeshLayers ? ['regionSurface', def.regionShapesId] : [] },
        marker: { visible: false, shape: 'dot', precision: 1, axisMap: def.axisMap },
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
      lod: { mode: 'auto', level: 0 },
    },
    physical,
    layers: buildLayers(ctx),
  }
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

export const viewConfigs = buildViewConfigs()

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
  const configs = buildViewConfigs(ctx.hasMesh)

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
// COMPOSITOR MODE
// ============================================================================
//
// The Compositor renders a single 2D slice perspective at a time (Coronal XY /
// Sagittal YZ / Horizontal XZ) and composites every channel simultaneously via
// additive blending. Each channel is a separate slice layer with its own color,
// contrast and visibility — unlike Explorer's single-channel select + global
// contrast. All three perspective views live in one galavi instance; only the
// active perspective is mounted to the single canvas (mount/unmount on switch).

export type CompositorPerspective = 'xy' | 'yz' | 'xz'

export interface CompositorChannelInit {
  color: string
  contrastLimits: Vec2
  visible: boolean
}

/** Stable layer id for a (perspective, channel) pair. */
export function compositorLayerId(perspKey: string, channelIndex: number): string {
  return `comp_${perspKey}_c${channelIndex}`
}

/** Normalize an omero color (`"0066FF"` or `"#0066FF"`) to `"#RRGGBB"`. */
export function normalizeHexColor(color: string | undefined): string | undefined {
  if (!color) return undefined
  const t = color.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(t)) return undefined
  return `#${t.toUpperCase()}`
}

const COMPOSITOR_FALLBACK_COLORS = ['#00B0FF', '#FF3D3D', '#7CFFB2', '#FFD23D']

/**
 * Seed per-channel appearance from the displayed imagery (default-perspective
 * slice source), falling back to the volume omero metadata, then a palette.
 * Colors default to the zarr `ome.omero.channels[].color`.
 */
export function getCompositorChannelDefaults(ctx: SetupContext): CompositorChannelInit[] {
  const refInfo = ctx.sliceSources.xy.info
  const colors = refInfo.omeroChannelColors ?? ctx.volumeInfo.omeroChannelColors ?? []
  const contrast = refInfo.omeroChannelContrastLimits ?? ctx.volumeInfo.omeroChannelContrastLimits ?? []
  const out: CompositorChannelInit[] = []
  for (let i = 0; i < ctx.channelCount; i++) {
    out.push({
      color: normalizeHexColor(colors[i]) ?? COMPOSITOR_FALLBACK_COLORS[i] ?? '#FFFFFF',
      contrastLimits: (contrast[i] ?? refInfo.autoContrast) as Vec2,
      visible: true,
    })
  }
  return out
}

/** Max slice index along the slice axis for a perspective. */
export function compositorSliceMax(ctx: SetupContext, perspKey: CompositorPerspective): number {
  const def = SLICE_DEFS.find((d) => d.key === perspKey)!
  const info = ctx.sliceSources[perspKey].info
  return Math.max(0, info.dataSize[def.axisMap[2]] - 1)
}

/** Initial (mid-stack) slice index for a perspective. */
export function compositorInitialSlice(ctx: SetupContext, perspKey: CompositorPerspective): number {
  const def = SLICE_DEFS.find((d) => d.key === perspKey)!
  const info = ctx.sliceSources[perspKey].info
  return Math.floor(info.dataSize[def.axisMap[2]] / 2)
}

function makeCompositorChannelLayer(
  def: SliceDef,
  ctx: SetupContext,
  channelIndex: number,
  init: CompositorChannelInit,
): LayerConfig {
  const sliceSource = ctx.sliceSources[def.key as CompositorPerspective]
  const info = sliceSource.info
  const tileU = sliceSource.tileSize[def.axisMap[0]]
  const tileV = sliceSource.tileSize[def.axisMap[1]]
  return {
    id: compositorLayerId(def.key, channelIndex),
    type: 'slice',
    data: { fetch: sliceSource.fetch },
    options: {
      axes: def.axes,
      dataSize: info.dataSize,
      levelRange: info.levelRange,
      tileSize: [tileU, tileV],
      sliceIndex: compositorInitialSlice(ctx, def.key as CompositorPerspective),
      selection: { ...info.defaultSelection, c: channelIndex },
    },
    render: {
      visible: init.visible,
      color: init.color,
      contrastLimits: init.contrastLimits,
      blending: 'additive',
    },
  } as LayerConfig
}

function buildCompositorState(ctx: SetupContext, channels: CompositorChannelInit[]): State {
  const vol = getVolumeTransform(ctx.volumeInfo)
  const physical = getPhysicalSpace(ctx.volumeInfo)
  const distance = vol.maxExtent * INITIAL_CAMERA_DISTANCE_FACTOR

  const layers: LayerConfig[] = []
  for (const def of SLICE_DEFS) {
    for (let c = 0; c < channels.length; c++) {
      layers.push(makeCompositorChannelLayer(def, ctx, c, channels[c]))
    }
  }

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
      lod: { mode: 'auto', level: 0 },
    },
    physical,
    layers,
  }
}

/**
 * Build the Compositor galavi instance. Creates all three perspective views
 * (each compositing every channel layer), mounting only `initialPerspective`
 * to the single canvas. Switch perspective via unmount(old)/mount(new, canvas).
 */
export async function bootstrapCompositor(
  ctx: SetupContext,
  canvas: HTMLCanvasElement,
  channels: CompositorChannelInit[],
  initialPerspective: CompositorPerspective = 'xy',
): Promise<Galavi> {
  const state = buildCompositorState(ctx, channels)

  const views: Record<string, ViewConfig> = {}
  for (const def of SLICE_DEFS) {
    const channelLayerIds = channels.map((_, c) => compositorLayerId(def.key, c))
    const view: ViewConfig = {
      type: 'slice',
      layers: channelLayerIds,
      controls: { panzoom: {}, resolution: {} },
      overlays: {
        scalebar: { visibleWhenActive: true, position: 'top-right' },
        marker: { visible: false, shape: 'dot', precision: 1, axisMap: def.axisMap },
      },
      label: `${def.anatomicalLabel} (${def.key.toUpperCase()})`,
      activatable: true,
    } as ViewConfig
    // Only the initial perspective gets the canvas (createGalavi auto-mounts it).
    if (def.key === initialPerspective) view.canvas = canvas
    views[def.key] = view
  }

  const galavi = await createGalavi({ state, views })
  galavi.setActiveView(initialPerspective)
  return galavi
}

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
import { openSlab, type Slab, type SliceAxis } from '@/openSlab'
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
  { key: 'xy', axes: ['x', 'y'], axisMap: vec3(0, 1, 2), layerId: 'sliceXY', regionShapesId: 'regionShapesXY', anatomicalLabel: 'Horizontal' },
  { key: 'yz', axes: ['y', 'z'], axisMap: vec3(1, 2, 0), layerId: 'sliceYZ', regionShapesId: 'regionShapesYZ', anatomicalLabel: 'Sagittal' },
  { key: 'xz', axes: ['x', 'z'], axisMap: vec3(0, 2, 1), layerId: 'sliceXZ', regionShapesId: 'regionShapesXZ', anatomicalLabel: 'Coronal' },
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
  meshVariant: string
  volumeInfo: OMEZarrInfo
  /** Per-mode precomputed projection slabs (visor-specific). */
  slabs: Record<'xy' | 'xz' | 'yz', Slab>
  conRange: Vec2
  /**
   * Per-imagery-layer autoContrast (from each source's omero.window).
   * Keys are layer ids (`volume`, `sliceXY`, `sliceXZ`, `sliceYZ`).
   * Used by useSliceState to scale the global slider per-layer so that the
   * 3D volume (mean-downsampled, dimmer) and the 2D slabs (max-projected,
   * brighter) share a single slider that maps to each layer's own intended
   * display range. Without this, applying a uniform `[lo,hi]` to all layers
   * makes slabs blow out white when 3D looks correct, or 3D black when
   * slabs look correct.
   */
  imageryAutoContrast: Record<string, Vec2>
  initCh: number
  initRegion: string
  channelCount: number
}

const INIT_REGION = 'brain_shell'

function findChannelDim(info: OMEZarrInfo): { count: number; init: number } {
  const c = info.selectionDims.find((d) => d.name === 'c')
  if (!c) return { count: 1, init: 0 }
  return { count: c.size, init: info.defaultSelection.c ?? 0 }
}

export async function buildSetupContext(specimen: Specimen): Promise<SetupContext> {
  const imageVariant = specimen.imageVariants?.[0]
  if (!imageVariant) {
    throw new Error(`Specimen ${specimen.id} has no image variants`)
  }
  const meshVariant = specimen.meshVariants?.[0] ?? imageVariant
  const volumeUrl = VISoRAPI.omeZarrUrl(specimen.id, 'image', imageVariant, '3d')
  const xyUrl = VISoRAPI.omeZarrUrl(specimen.id, 'image', imageVariant, 'xy')
  const xzUrl = VISoRAPI.omeZarrUrl(specimen.id, 'image', imageVariant, 'xz')
  const yzUrl = VISoRAPI.omeZarrUrl(specimen.id, 'image', imageVariant, 'yz')
  // sliceAxis (in [x, y, z] order): xy ⇒ z=2, xz ⇒ y=1, yz ⇒ x=0.
  const [volumeInfo, xySlab, xzSlab, yzSlab] = await Promise.all([
    openOMEZarr(volumeUrl),
    openSlab(xyUrl, 2 as SliceAxis),
    openSlab(xzUrl, 1 as SliceAxis),
    openSlab(yzUrl, 0 as SliceAxis),
  ])
  const ch = findChannelDim(volumeInfo)
  // Per-layer autoContrast: each upstream zarr.json declares its own
  // omero.channels[0].window which the adapter normalizes into
  // OMEZarrInfo.autoContrast. The 3D volume and the 2D max-projection slabs
  // legitimately need different display ranges (mean vs max sampling), so
  // we keep them separate and compose them downstream.
  const imageryAutoContrast: Record<string, Vec2> = {
    volume: [volumeInfo.autoContrast[0], volumeInfo.autoContrast[1]],
    sliceXY: [xySlab.info.autoContrast[0], xySlab.info.autoContrast[1]],
    sliceXZ: [xzSlab.info.autoContrast[0], xzSlab.info.autoContrast[1]],
    sliceYZ: [yzSlab.info.autoContrast[0], yzSlab.info.autoContrast[1]],
  }
  // Slider's reference range is the volume's autoContrast. Per-layer
  // contrastLimits at render time = sliderRange * (layerAuto / volumeAuto).
  const conRange: Vec2 = [volumeInfo.autoContrast[0], volumeInfo.autoContrast[1]]
  return {
    specimenId: specimen.id,
    meshVariant,
    volumeInfo,
    slabs: { xy: xySlab, xz: xzSlab, yz: yzSlab },
    conRange,
    imageryAutoContrast,
    initCh: ch.init,
    initRegion: INIT_REGION,
    channelCount: ch.count,
  }
}

// ============================================================================
// LEVEL RANGES
// ============================================================================

export function getViewLevelRange(viewName: string, ctx: SetupContext): Vec2 {
  if (viewName === 'xy' || viewName === 'xz' || viewName === 'yz') {
    return ctx.slabs[viewName].info.levelRange
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
  // Each slice mode renders from its own precomputed projection slab
  // (specimens.json image.recon-v2 paths[2..4] for xy/xz/yz). The slabs are
  // stored separately for performance: their slab axis indexes precomputed
  // projection planes (one per ~20um stride in upstream voxels), and only
  // the in-plane axes downsample with pyramid level. A custom slab fetcher
  // (see openSlab.ts) reads exactly one plane per request and packs it into
  // the u-fastest 2D layout the slice layer's r16float texture expects.
  const slab = ctx.slabs[def.key as 'xy' | 'xz' | 'yz']
  const info = slab.info
  const sliceAxis = def.axisMap[2]
  const initialSliceIndex = Math.floor(info.dataSize[sliceAxis] / 2)
  const tileU = slab.tileSize[def.axisMap[0]]
  const tileV = slab.tileSize[def.axisMap[1]]
  return {
    id: def.layerId,
    type: 'slice',
    data: { fetch: slab.fetch },
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

function makeSurfaceLayer(ctx: SetupContext): LayerConfig {
  // Mesh OBJs in this dataset are exported in a 10×-downsampled local frame
  // (vertex extent ≈ volume_voxels / 10). Galavi rescales the mesh into the
  // shared physical space using `dataSize` as the mesh's local bounding box.
  const phys = getPhysicalSpace(ctx.volumeInfo).spatial.size
  const meshSize: Vec3 = [phys[0] / 10, phys[1] / 10, phys[2] / 10]
  return {
    id: 'surface',
    type: 'surface',
    data: { url: VISoRAPI.getMeshUrl(ctx.specimenId, ctx.meshVariant, ctx.initRegion) },
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
  const phys = getPhysicalSpace(ctx.volumeInfo).spatial.size
  const meshSize: Vec3 = [phys[0] / 10, phys[1] / 10, phys[2] / 10]
  return {
    id: 'regionSurface',
    type: 'surface',
    data: { url: VISoRAPI.getMeshUrl(ctx.specimenId, ctx.meshVariant, ctx.initRegion) },
    options: { dataSize: meshSize, regionLabel: 'Brain Shell' },
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
  return [
    makeVolumeLayer(ctx),
    makeSurfaceLayer(ctx),
    ...SLICE_DEFS.map((def) => makeSliceLayer(def, ctx)),
    makeRegionSurfaceLayer(ctx),
    ...SLICE_DEFS.map((def) => makeRegionShapesLayer(def)),
  ]
}

// ============================================================================
// VIEW CONFIG FACTORY
// ============================================================================

function buildViewConfigs(): Record<ConfiguredViewName, ViewTemplate> {
  const configs: Record<string, ViewTemplate> = {
    volume: {
      type: 'volume',
      layers: ['volume', 'regionSurface'],
      controls: { orbit: {}, fly: {}, resolution: {} },
      overlays: {
        scalebar: { visibleWhenActive: true, position: 'top-right' },
        text: { position: 'top-left', visibleWhenActive: true, regionDataIds: ['regionSurface'] },
        marker: { visible: false, shape: 'dot', precision: 1, shapeSize: 12 },
      },
      label: '3D Volume',
      activatable: true,
    },
    navigator: {
      type: 'navigator',
      layers: ['surface'],
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
      layers: [def.layerId, 'regionSurface', def.regionShapesId],
      controls: { panzoom: {}, resolution: {} },
      overlays: {
        scalebar: { visibleWhenActive: true, position: 'top-right' },
        text: { position: 'top-left', visibleWhenActive: true, regionDataIds: ['regionSurface', def.regionShapesId] },
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

  const views: Record<string, ViewConfig> = {
    ...viewConfigs,
    [mainViewName]: { ...viewConfigs[mainViewName], canvas: mainCanvas },
    ...Object.fromEntries(
      sideViewNames
        .filter((name) => sideCanvases[name])
        .map((name) => [name, { ...viewConfigs[name], canvas: sideCanvases[name] }]),
    ),
  }

  return createGalavi({ state: sessionState, views })
}

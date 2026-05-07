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
  conRange: Vec2
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
  const volumeInfo = await openOMEZarr(volumeUrl)
  const ch = findChannelDim(volumeInfo)
  return {
    specimenId: specimen.id,
    meshVariant,
    volumeInfo,
    conRange: volumeInfo.autoContrast,
    initCh: ch.init,
    initRegion: INIT_REGION,
    channelCount: ch.count,
  }
}

// ============================================================================
// LEVEL RANGES
// ============================================================================

export function getViewLevelRange(_viewName: string, ctx: SetupContext): Vec2 {
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
      contrastLimits: ctx.conRange,
      blending: 'additive',
    },
  } as LayerConfig
}

function makeSliceLayer(def: SliceDef, ctx: SetupContext): LayerConfig {
  const info = ctx.volumeInfo
  // sliceIndex walks along the axis NOT in `axes`; default to mid-volume.
  const sliceAxis = def.axisMap[2]
  const initialSliceIndex = Math.floor(info.dataSize[sliceAxis] / 2)
  return {
    id: def.layerId,
    type: 'slice',
    data: { fetch: info.fetchTile },
    options: {
      axes: def.axes,
      dataSize: info.dataSize,
      levelRange: info.levelRange,
      tileSize: [info.tileSize[0], info.tileSize[1]],
      sliceIndex: initialSliceIndex,
      selection: { ...info.defaultSelection, c: ctx.initCh },
    },
    render: {
      visible: true,
      contrastLimits: ctx.conRange,
      blending: 'additive',
    },
  } as LayerConfig
}

function makeSurfaceLayer(ctx: SetupContext): LayerConfig {
  const phys = getPhysicalSpace(ctx.volumeInfo).spatial.size
  return {
    id: 'surface',
    type: 'surface',
    data: { url: VISoRAPI.getMeshUrl(ctx.specimenId, ctx.meshVariant, ctx.initRegion) },
    options: { dataSize: phys },
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
  return {
    id: 'regionSurface',
    type: 'surface',
    data: { url: VISoRAPI.getMeshUrl(ctx.specimenId, ctx.meshVariant, ctx.initRegion) },
    options: { dataSize: phys, regionLabel: 'Brain Shell' },
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

function buildLayers(ctx: SetupContext): LayerConfig[] {
  return [
    makeVolumeLayer(ctx),
    makeSurfaceLayer(ctx),
    ...SLICE_DEFS.map((def) => makeSliceLayer(def, ctx)),
    makeRegionSurfaceLayer(ctx),
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
      layers: [def.layerId, 'regionSurface'],
      controls: { panzoom: {}, resolution: {} },
      overlays: {
        scalebar: { visibleWhenActive: true, position: 'top-right' },
        text: { position: 'top-left', visibleWhenActive: true, regionDataIds: ['regionSurface'] },
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

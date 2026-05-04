/**
 * Galavi setup for cerevi-web.
 *
 * Adapted from the-explorer's galavi-setup.ts but parameterized
 * by Specimen metadata fetched from the VISoR API.
 *
 * Owns: dataset constants, layer factories, view config generation,
 * and the createGalavi bootstrap call.
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
import type { Specimen } from '@/types'

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
  axisMap: Vec3
  urlTag: string
  layerId: string
  regionShapesId: string
  anatomicalLabel: string
}

export const SLICE_DEFS: SliceDef[] = [
  { key: 'xy', axes: ['x', 'y'], axisMap: vec3(0, 1, 2), urlTag: 'imgxy', layerId: 'sliceXY', regionShapesId: 'regionShapesXY', anatomicalLabel: 'Horizontal' },
  { key: 'yz', axes: ['y', 'z'], axisMap: vec3(1, 2, 0), urlTag: 'imgyz', layerId: 'sliceYZ', regionShapesId: 'regionShapesYZ', anatomicalLabel: 'Sagittal' },
  { key: 'xz', axes: ['x', 'z'], axisMap: vec3(0, 2, 1), urlTag: 'imgxz', layerId: 'sliceXZ', regionShapesId: 'regionShapesXZ', anatomicalLabel: 'Coronal' },
]

export const REGION_DATA_IDS = [
  'regionSurface',
  ...SLICE_DEFS.map(s => s.regionShapesId),
]

export const IMAGERY_IDS = ['volume', ...SLICE_DEFS.map(s => s.layerId)]

// ============================================================================
// SETUP CONTEXT (built per-specimen)
// ============================================================================

export interface SetupContext {
  srcPrefix: string
  shapesPrefix: string
  dataSize: Vec3
  surfaceSize: Vec3
  scale: number
  conRange: Vec2
  mip: number
  initCh: number
  initRegion: string
  channelCount: number
  volumeLevelRange: Vec2
  volumeTileSize: Vec3
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export function buildSetupContext(specimen: Specimen): SetupContext {
  const srcPrefix = `${API_BASE_URL}/data/${specimen.id}`
  const info = specimen.imageInfo

  // physical_size_um is [z, y, x] from the API — map to [x, y, z]
  const [z, y, x] = info.physical_size_um
  const dataSize: Vec3 = [x, y, z]

  const voxelSize = 1 // μm/voxel at level 0
  const mip = info.tile_thickness_2d || 20

  return {
    srcPrefix,
    shapesPrefix: import.meta.env.VITE_SHAPE_URL ?? '',
    dataSize,
    surfaceSize: [dataSize[0] / 10, dataSize[1] / 10, dataSize[2] / 10],
    scale: voxelSize,
    conRange: [0.0, 0.05],
    mip,
    initCh: 0,
    initRegion: 'brain_shell',
    channelCount: info.channels?.length ?? 4,
    volumeLevelRange: vec2(0, (info.resolutions_um_3d?.length ?? 1) - 1),
    volumeTileSize: info.tile_size_3d ?? vec3(64, 64, 64),
  }
}

// ============================================================================
// LAYER FACTORIES
// ============================================================================

export const SLICE_LEVEL_RANGE: Vec2 = vec2(0, 6)

export function getViewLevelRange(viewName: string, ctx: SetupContext): Vec2 {
  if (viewName === 'volume') return ctx.volumeLevelRange
  return SLICE_LEVEL_RANGE
}

function makeSliceLayer(def: SliceDef, ctx: SetupContext) {
  return {
    id: def.layerId,
    type: 'slice',
    data: {
      urlTemplate: `${ctx.srcPrefix}:${def.urlTag}:{level}:{c}:{z},{y},{x}`,
    },
    options: {
      axes: def.axes,
      mipThickness: ctx.mip,
      contrastRange: ctx.conRange,
      dataSize: ctx.dataSize,
      scale: ctx.scale,
      selection: { c: ctx.initCh },
      levelRange: SLICE_LEVEL_RANGE,
      tileSize: vec2(512, 512),
      maxPoolSize: 512,
    },
  }
}

function makeRegionShapesLayer(def: SliceDef, ctx: SetupContext) {
  return {
    id: def.regionShapesId,
    type: 'shapes',
    ...(ctx.shapesPrefix
      ? { data: { urlTemplate: `${ctx.shapesPrefix}/${ctx.initRegion}/{axis}/{slicePos}` } }
      : {}),
    options: {
      color: vec3(0.9, 0.2, 0.2),
      opacity: 1.0,
      surfaceSourceId: 'regionSurface',
      axes: def.axes,
      regionLabel: 'Brain Shell',
    },
    render: { visible: false },
  }
}

function buildLayers(ctx: SetupContext): LayerConfig[] {
  return [
    // Volume
    {
      id: 'volume',
      type: 'volume',
      data: { urlTemplate: `${ctx.srcPrefix}:img3d:{level}:{c}:{z},{y},{x}` },
      options: {
        contrastRange: ctx.conRange,
        dataSize: ctx.dataSize,
        scale: ctx.scale,
        selection: { c: ctx.initCh },
        levelRange: ctx.volumeLevelRange,
        tileSize: ctx.volumeTileSize,
        maxPoolSize: 512,
      },
    },
    // Navigator surface
    {
      id: 'surface',
      type: 'surface',
      data: { url: `${ctx.srcPrefix}:meh3d:::brain_shell` },
      options: {
        dataSize: ctx.surfaceSize,
      },
      render: {
        color       : '#C0C5CE',
        opacity     : 0.8,
        wireframe   : false,
        doubleSided : true,
        shading     : 'xray',
      },
    },
    // Slice layers
    ...SLICE_DEFS.map(def => makeSliceLayer(def, ctx)),
    // Region surface overlay
    {
      id: 'regionSurface',
      type: 'surface',
      data: { url: `${ctx.srcPrefix}:meh3d:::${ctx.initRegion}` },
      options: {
        dataSize    : ctx.surfaceSize,
        regionLabel : 'Brain Shell',
      },
      render: {
        visible     : false,
        color       : '#E63333',
        opacity     : 0.6,
        wireframe   : false,
        doubleSided : true,
        shading     : 'xray',
      },
    },
    // Region shape overlays (one per slice plane)
    ...SLICE_DEFS.map(def => makeRegionShapesLayer(def, ctx)),
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
      controls: {
        orbit: {},
        fly: {},
        resolution: {},
      },
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
      layers: [def.layerId, 'regionSurface', def.regionShapesId],
      controls: {
        panzoom: {},
        resolution: {},
      },
      overlays: {
        scalebar: { visibleWhenActive: true, position: 'top-right' },
        text: { position: 'top-left', visibleWhenActive: true, regionDataIds: [def.regionShapesId] },
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
  const physicalSize: Vec3 = [
    ctx.dataSize[0] * ctx.scale,
    ctx.dataSize[1] * ctx.scale,
    ctx.dataSize[2] * ctx.scale,
  ]
  const target: Vec3 = [physicalSize[0] / 2, physicalSize[1] / 2, physicalSize[2] / 2]
  const distance = Math.max(...physicalSize) * INITIAL_CAMERA_DISTANCE_FACTOR

  return {
    exploration: {
      camera: {
        navMode: 'orbit',
        projMode: 'perspective',
        position: [
          target[0] + distance * Math.cos(-0.4) * Math.sin(0.5),
          target[1] + distance * Math.sin(-0.4),
          target[2] + distance * Math.cos(-0.4) * Math.cos(0.5),
        ],
        target,
      },
      lod: { mode: 'auto', level: 0 },
    },
    physical: { spatial: { size: physicalSize, unit: 'μm' } },
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

/**
 * Create the Galavi instance with all views wired to their canvases.
 */
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
        .filter(name => sideCanvases[name])
        .map(name => [name, { ...viewConfigs[name], canvas: sideCanvases[name] }]),
    ),
  }

  return createGalavi({ state: sessionState, views })
}

/**
 * View/camera factories — view config templates, initial session state, and
 * the multi-view bootstrap (split from src/galavi-setup.ts).
 */

import {
  createViewerEngine,
  frameVolumeCamera,
  type State,
  type ViewConfig,
  type ViewerEngine,
} from 'galavi/advanced'
import { getGalaviTheme } from '@/composables/useTheme'
import { SLICE_PLANES, type SetupContext } from './context'
import { sliceDef } from './slice-geometry'
import { buildLayers, sliceLayerIds } from './layer-factories'

export type ViewName = 'volume' | 'navigator' | 'xy' | 'yz' | 'xz' | 'none'
export type ConfiguredViewName = Exclude<ViewName, 'none'>
type ViewTemplate = Omit<ViewConfig, 'canvas'>

function buildViewConfigs(ctx: SetupContext, composeSliceChannels = false): Record<ConfiguredViewName, ViewTemplate> {
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
        'magnifier-2d': { visible: false },
      },
      label: '3D',
      activatable: true,
    },
    navigator: {
      type: 'navigator',
      // NavigatorView builds its ImagePipeline without texture/colormap
      // samplers, so the tiled 'volume' layer can never be assigned here —
      // mesh specimens show the surface, others get the reticle-only frame.
      layers: hasMeshLayers ? ['surface'] : [],
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
    const imageryLayerIds = sliceLayerIds(ctx, def, composeSliceChannels)
    configs[def.key] = {
      type: 'slice',
      // `regionSurface` is included so the per-axis `regionShapes*` shapes
      // layer can resolve it via `surfaceSourceId` and intersect it with the
      // current slice plane. The surface layer itself doesn't draw anything
      // useful in slice views (galavi's slice ortho camera clips meshes), but
      // the OBJ is downloaded once and reused as the geometry source.
      layers: hasMeshLayers
        ? [...imageryLayerIds, 'regionSurface', def.regionShapesId]
        : imageryLayerIds,
      controls: { panzoom: {} },
      overlays: {
        // Tools are hidden until the store wires visibility via setOverlayOptions.
        crosshair: { visible: false },
        ruler: { visible: false },
        roiselector: { visible: false, enabled: false },
        'magnifier-2d': { visible: false },
        'magnifier-3d': { visible: false, voxelExtent3d: 32, layers: ['volume'] },
      },
      label: `${def.anatomicalLabel} (${def.key.toUpperCase()})`,
      activatable: true,
    }
  }

  return configs as Record<ConfiguredViewName, ViewTemplate>
}

function buildSessionState(ctx: SetupContext, composeSliceChannels = false): State {
  const physical = ctx.dataset.physical

  return {
    exploration: {
      camera: frameVolumeCamera(physical),
    },
    physical,
    layers: buildLayers(ctx, composeSliceChannels),
  }
}

export function isConfiguredViewName(name: ViewName): name is ConfiguredViewName {
  return name !== 'none'
}

export async function bootstrap(
  ctx: SetupContext,
  mainCanvas: HTMLCanvasElement,
  sideCanvases: Record<string, HTMLCanvasElement>,
  mainViewName: ConfiguredViewName,
  sideViewNames: ConfiguredViewName[],
  options: { composeSliceChannels?: boolean } = {},
): Promise<ViewerEngine> {
  const composeSliceChannels = options.composeSliceChannels ?? false
  const sessionState = buildSessionState(ctx, composeSliceChannels)
  const configs = buildViewConfigs(ctx, composeSliceChannels)

  const views: Record<string, ViewConfig> = {
    ...configs,
    [mainViewName]: { ...configs[mainViewName], canvas: mainCanvas },
    ...Object.fromEntries(
      sideViewNames
        .filter((name) => sideCanvases[name])
        .map((name) => [name, { ...configs[name], canvas: sideCanvases[name] }]),
    ),
  }

  return createViewerEngine({ state: sessionState, views, theme: getGalaviTheme() })
}

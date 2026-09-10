/**
 * View/camera factories — view config templates, initial session state, and
 * the multi-view bootstrap over a loaded CereviDataset.
 */

import {
  createViewerRuntime,
  frameVolumeCamera,
  type State,
  type ViewConfig,
  type ViewerRuntime,
} from 'galavi'
import { getGalaviTheme } from '@/composables/useTheme'
import type { CereviDataset } from './specimen-dataset'
import { SLICE_PLANES, sliceDef } from './slice-geometry'
import { buildLayers, sliceLayerIds } from './layer-factories'

export type ViewName = 'volume' | 'navigator' | 'xy' | 'yz' | 'xz' | 'none'
export type ConfiguredViewName = Exclude<ViewName, 'none'>
type ViewTemplate = Omit<ViewConfig, 'canvas'>

function buildViewConfigs(dataset: CereviDataset, composeSliceChannels = false): Record<ConfiguredViewName, ViewTemplate> {
  const hasMeshLayers = dataset.meshResource() !== undefined
  const configs: Record<string, ViewTemplate> = {
    volume: {
      type: 'volume',
      layers: hasMeshLayers ? ['volume', 'regionSurface'] : ['volume'],
      controls: { orbit: {}, fly: {} },
      autoRotate: true,
      overlays: {
        // Tools are hidden until the store wires visibility via setOverlayOptions.
        'roi-selector': { enabled: false },
        ruler: { visible: false },
        'magnifier-2d': { visible: false },
      },
      label: '3D',
      activatable: true,
    },
    navigator: {
      type: 'navigator',
      // NavigatorView builds its ViewPipeline without texture/colormap
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
    const def = sliceDef(dataset, plane)
    const imageryLayerIds = sliceLayerIds(dataset, def, composeSliceChannels)
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
        'roi-selector': { visible: false, enabled: false },
        'magnifier-2d': { visible: false },
        'magnifier-3d': { visible: false, voxelExtent3d: 32, layers: ['volume'] },
      },
      label: `${def.anatomicalLabel} (${def.key.toUpperCase()})`,
      activatable: true,
    }
  }

  return configs as Record<ConfiguredViewName, ViewTemplate>
}

function buildSessionState(dataset: CereviDataset, composeSliceChannels = false): State {
  const physical = dataset.physical

  return {
    exploration: {
      camera: frameVolumeCamera(physical),
    },
    physical,
    layers: buildLayers(dataset, composeSliceChannels),
  }
}

export function isConfiguredViewName(name: ViewName): name is ConfiguredViewName {
  return name !== 'none'
}

export async function bootstrap(
  dataset: CereviDataset,
  mainCanvas: HTMLCanvasElement,
  sideCanvases: Record<string, HTMLCanvasElement>,
  mainViewName: ConfiguredViewName,
  sideViewNames: ConfiguredViewName[],
  options: { composeSliceChannels?: boolean; deferMount?: boolean } = {},
): Promise<ViewerRuntime> {
  const composeSliceChannels = options.composeSliceChannels ?? false
  const sessionState = buildSessionState(dataset, composeSliceChannels)
  const configs = buildViewConfigs(dataset, composeSliceChannels)

  // deferMount: build the views without canvases and init the GPU here (the
  // realistic failure point), so the caller can destroy any previous runtime
  // still owning those canvases and only then mount via runtime.mountAll() —
  // mounting reconfigures a canvas's shared WebGPU context.
  const deferMount = options.deferMount ?? false
  const views: Record<string, ViewConfig> = deferMount
    ? { ...configs }
    : {
        ...configs,
        [mainViewName]: { ...configs[mainViewName], canvas: mainCanvas },
        ...Object.fromEntries(
          sideViewNames
            .filter((name) => sideCanvases[name])
            .map((name) => [name, { ...configs[name], canvas: sideCanvases[name] }]),
        ),
      }

  const runtime = await createViewerRuntime({ state: sessionState, views, theme: getGalaviTheme() })
  if (deferMount) await runtime.initGPU()
  return runtime
}

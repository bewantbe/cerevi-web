/**
 * Standalone view builders — small one-off Galavi instances outside the
 * bootstrapped multi-view session: slice thumbnails/previews and the mesh
 * navigator overview. Shared by SliceMode, QuadrantMode, and SliceNavigator.
 * Every builder reads its imagery from the loaded CereviDataset's resources.
 */

import {
  createViewerRuntime,
  type LayerConfig,
  type State,
  type Vec2,
  type Vec3,
  type ViewConfig,
  type ViewerRuntime,
} from 'galavi'
import { getGalaviTheme } from '@/composables/useTheme'
import type { CereviDataset } from './specimen-dataset'
import type { SlicePlane } from './slice-geometry'
import {
  contrastLimitsForPlane,
  fitSliceCamera,
  initialChannel,
  initialSlice,
  orientedVolumeTransform,
  physicalFraming,
  sliceData,
  sliceDef,
  sliceSource,
  storageSliceIndex,
} from './slice-geometry'
import { makeMeshDataSize } from './layer-factories'

export interface BuildSliceViewerOptions {
  ctx: CereviDataset
  plane: SlicePlane
  channel: number | null
  color?: string
  contrastLimits?: Vec2
  sliceIndex: number
  /**
   * Target canvas. Omit to build the runtime unmounted (GPU initialized only)
   * so the caller can destroy any previous runtime on the target canvas first,
   * then mount via `runtime.mount('main', canvas)`.
   */
  canvas?: HTMLCanvasElement
}

/** Non-interactive single-channel slice view on its own canvas (thumbnails, slider previews, navigator fallback). */
export async function buildSliceViewer(options: BuildSliceViewerOptions): Promise<ViewerRuntime> {
  const { ctx, plane, color, contrastLimits, sliceIndex, canvas } = options
  const definition = sliceDef(ctx, plane)
  const source = sliceSource(ctx, plane)
  const channel = options.channel ?? source.defaultSelection.c ?? 0
  const fit = fitSliceCamera(ctx, plane)
  const { size, unit } = physicalFraming(ctx)
  const layer: LayerConfig = {
    id: 'slice',
    type: 'slice',
    data: sliceData(ctx, plane),
    options: {
      axes: definition.axes,
      sliceIndex: storageSliceIndex(ctx, plane, sliceIndex),
      selection: { ...source.defaultSelection, c: channel },
    },
    render: {
      visible: options.channel !== null,
      ...(color ? { color } : { colormap: 'gray' }),
      contrastLimits: contrastLimits ?? contrastLimitsForPlane(ctx, plane, channel),
      blending: 'additive',
    },
  }
  const view: ViewConfig = {
    type: 'slice',
    ...(canvas ? { canvas } : {}),
    layers: ['slice'],
    overlays: { crosshair: { visible: false } },
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
  const runtime = await createViewerRuntime({ state, views: { main: view }, theme: getGalaviTheme() })
  // Canvasless builds init the GPU here so the caller can mount the views
  // later, after any previous runtime on the target canvas has been destroyed.
  if (!canvas) await runtime.initGPU()
  return runtime
}

/** Camera pull-back factor for the mesh navigator overview (relative to maxExtent). */
export const NAVIGATOR_DISTANCE_FACTOR = 1.55

export type NavigatorCameraMode = 'active-plane' | 'slice-view'

function navigatorCamera(
  ctx: CereviDataset,
  plane: SlicePlane,
  mode: NavigatorCameraMode = 'active-plane',
): { position: Vec3; target: Vec3; up: Vec3 } {
  const { center, maxExtent } = physicalFraming(ctx)
  const distance = maxExtent * NAVIGATOR_DISTANCE_FACTOR
  let forward: Vec3
  let up: Vec3
  if (mode === 'slice-view' && plane === 'yz') {
    // Sagittal slice views look along the dorsal axis with anterior up.
    const [anteriorAxis, dorsalAxis] = sliceDef(ctx, 'yz').axisMap
    forward = [0, 0, 0]
    forward[dorsalAxis] = 1
    up = [0, 0, 0]
    up[anteriorAxis] = 1
  } else {
    // 'active-plane' frames the plane's own orientation; 'slice-view' for
    // xy/xz reuses the coronal (xy) view orientation.
    const reference = mode === 'slice-view' ? 'xy' : plane
    const [, upAxis, sliceAxis] = sliceDef(ctx, reference).axisMap
    up = [0, 0, 0]
    up[upAxis] = 1
    const sliceDirection: Vec3 = [0, 0, 0]
    sliceDirection[sliceAxis] = 1
    forward = [
      up[1] * sliceDirection[2] - up[2] * sliceDirection[1],
      up[2] * sliceDirection[0] - up[0] * sliceDirection[2],
      up[0] * sliceDirection[1] - up[1] * sliceDirection[0],
    ]
  }
  return {
    position: center.map((value, axis) => value - forward[axis] * distance) as Vec3,
    target: center,
    up,
  }
}

export interface BuildNavigatorOptions {
  ctx: CereviDataset
  plane: SlicePlane
  /**
   * Target canvas. Omit to build the runtime unmounted (GPU initialized only)
   * so the caller can destroy any previous runtime on the target canvas first,
   * then mount via `runtime.mount('main', canvas)`.
   */
  canvas?: HTMLCanvasElement
  channel?: number | null
  color?: string
  cameraMode?: NavigatorCameraMode
}

/** Small 3D overview: the specimen mesh, or a fallback slice view when no mesh exists. */
export async function buildNavigatorOverview(options: BuildNavigatorOptions): Promise<ViewerRuntime> {
  const { ctx, plane, canvas } = options
  const channel = options.channel === undefined ? initialChannel(ctx) : options.channel
  const mesh = ctx.meshResource()

  if (!mesh || mesh.downsampleFactor === undefined) {
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
  const camera = navigatorCamera(ctx, plane, options.cameraMode ?? 'active-plane')

  const layers: LayerConfig[] = [
    {
      id: 'surface',
      type: 'surface',
      data: { url: mesh.source, transform: orientedVolumeTransform(ctx) },
      options: { dataSize: meshSize },
      render: {
        color: options.color ?? '#C7CCD6',
        opacity: 0.88,
        wireframe: false,
        doubleSided: true,
        shading: 'xray',
      },
    },
  ]

  const view: ViewConfig = {
    type: 'volume',
    ...(canvas ? { canvas } : {}),
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

  const runtime = await createViewerRuntime({ state, views: { main: view }, theme: getGalaviTheme() })
  if (!canvas) await runtime.initGPU()
  return runtime
}

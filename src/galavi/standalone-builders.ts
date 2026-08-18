/**
 * Standalone view builders — small one-off Galavi instances outside the
 * bootstrapped multi-view session: slice thumbnails/previews and the mesh
 * navigator overview. Shared by SliceMode, QuadrantMode, and SliceNavigator
 * (dissolved from the old src/galavi/gallery.ts module, D7).
 */

import {
  createViewerEngine,
  type LayerConfig,
  type State,
  type Vec2,
  type Vec3,
  type ViewConfig,
  type ViewerEngine,
} from 'galavi/advanced'
import { getGalaviTheme } from '@/composables/useTheme'
import type { SetupContext, SlicePlane } from './context'
import {
  contrastLimitsForPlane,
  fitSliceCamera,
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
  ctx: SetupContext
  plane: SlicePlane
  channel: number | null
  color?: string
  contrastLimits?: Vec2
  sliceIndex: number
  canvas: HTMLCanvasElement
}

/** Non-interactive single-channel slice view on its own canvas (thumbnails, slider previews, navigator fallback). */
export async function buildSliceViewer(options: BuildSliceViewerOptions): Promise<ViewerEngine> {
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
  }
  const view: ViewConfig = {
    type: 'slice',
    canvas,
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
  return createViewerEngine({ state, views: { main: view }, theme: getGalaviTheme() })
}

/** Camera pull-back factor for the mesh navigator overview (relative to maxExtent). */
export const NAVIGATOR_DISTANCE_FACTOR = 1.55

export type NavigatorCameraMode = 'active-plane' | 'slice-view'

function navigatorCamera(
  ctx: SetupContext,
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
  ctx: SetupContext
  plane: SlicePlane
  canvas: HTMLCanvasElement
  channel?: number | null
  color?: string
  cameraMode?: NavigatorCameraMode
}

/** Small 3D overview: the specimen mesh, or a fallback slice view when no mesh exists. */
export async function buildNavigatorOverview(options: BuildNavigatorOptions): Promise<ViewerEngine> {
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
  const camera = navigatorCamera(ctx, plane, options.cameraMode ?? 'active-plane')

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
    },
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

  return createViewerEngine({ state, views: { main: view }, theme: getGalaviTheme() })
}

import {
  createGalavi,
  type Galavi,
  type LayerConfig,
  type State,
  type Vec2,
  type Vec3,
  type ViewConfig,
} from 'galavi'
import type { GalleryChannel } from '@/stores/visor'
import {
  fitSliceCamera,
  physicalFraming,
  sliceDef,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'

export function compositorLayerId(channelIndex: number): string {
  return `comp_c${channelIndex}`
}

function baseExploration(position: Vec3, target: Vec3): State['exploration'] {
  return {
    camera: {
      navMode: 'fly',
      projMode: 'orthographic',
      position,
      target,
    },
  }
}

function makeCompositorLayer(
  ctx: SetupContext,
  plane: SlicePlane,
  channel: GalleryChannel,
  sliceIndex: number,
): LayerConfig {
  const definition = sliceDef(plane)
  const source = ctx.sliceSources[plane]
  return {
    id: compositorLayerId(channel.index),
    type: 'slice',
    data: { fetch: source.fetch, pyramid: source.pyramid },
    options: {
      axes: definition.axes,
      sliceIndex,
      selection: { ...source.info.defaultSelection, c: channel.index },
    },
    render: {
      visible: channel.visible,
      color: channel.color,
      contrastLimits: [channel.contrastMin, channel.contrastMax],
      blending: 'additive',
    },
  } as LayerConfig
}

export interface BuildCompositorOptions {
  ctx: SetupContext
  plane: SlicePlane
  channels: GalleryChannel[]
  sliceIndex: number
  canvas: HTMLCanvasElement
}

export async function buildCompositor(options: BuildCompositorOptions): Promise<Galavi> {
  const { ctx, plane, channels, sliceIndex, canvas } = options
  const camera = fitSliceCamera(ctx, plane)
  const { size, unit } = physicalFraming(ctx)
  const layers = channels.map((channel) => makeCompositorLayer(ctx, plane, channel, sliceIndex))
  const view: ViewConfig = {
    type: 'slice',
    canvas,
    layers: layers.map((layer) => layer.id),
    controls: { panzoom: {} },
    label: plane,
    activatable: true,
  }
  const state: State = {
    physical: { spatial: { size, unit } },
    layers,
    exploration: baseExploration(camera.position, camera.target),
  }
  const galavi = await createGalavi({ state, views: { main: view } })
  galavi.setActiveView('main')
  return galavi
}

export interface BuildSliceViewerOptions {
  ctx: SetupContext
  plane: SlicePlane
  channel: number | null
  color?: string
  contrastLimits?: Vec2
  sliceIndex: number
  canvas: HTMLCanvasElement
  interactive?: boolean
  target?: Vec3
  distance?: number
}

export async function buildSliceViewer(options: BuildSliceViewerOptions): Promise<Galavi> {
  const { ctx, plane, color, contrastLimits, sliceIndex, canvas, interactive } = options
  const definition = sliceDef(plane)
  const source = ctx.sliceSources[plane]
  const channel = options.channel ?? source.info.defaultSelection.c ?? 0
  const fit = fitSliceCamera(ctx, plane)
  const target = options.target ? [...options.target] as Vec3 : fit.target
  const distance = options.distance ?? fit.distance
  const position = [...target] as Vec3
  position[definition.axisMap[2]] += distance
  const { size, unit } = physicalFraming(ctx)
  const layer: LayerConfig = {
    id: 'slice',
    type: 'slice',
    data: { fetch: source.fetch, pyramid: source.pyramid },
    options: {
      axes: definition.axes,
      sliceIndex,
      selection: { ...source.info.defaultSelection, c: channel },
    },
    render: {
      visible: options.channel !== null,
      ...(color ? { color } : { colormap: 'gray' }),
      contrastLimits: contrastLimits ?? source.info.autoContrast,
      blending: 'additive',
    },
  } as LayerConfig
  const view: ViewConfig = {
    type: 'slice',
    canvas,
    layers: ['slice'],
    activatable: Boolean(interactive),
    ...(interactive ? { controls: { panzoom: {} } } : {}),
  }
  const state: State = {
    physical: { spatial: { size, unit } },
    layers: [layer],
    exploration: baseExploration(position, target),
  }
  return createGalavi({ state, views: { main: view } })
}

function makeMeshDataSize(ctx: SetupContext): Vec3 {
  const { size } = physicalFraming(ctx)
  const downsampleFactor = ctx.meshDownsampleFactor && ctx.meshDownsampleFactor > 0
    ? ctx.meshDownsampleFactor
    : 1
  return [
    size[0] / downsampleFactor,
    size[1] / downsampleFactor,
    size[2] / downsampleFactor,
  ]
}

/** Camera pull-back factor for the left-side mesh navigator (relative to maxExtent). */
export const NAVIGATOR_DISTANCE_FACTOR = 1.55

function navigatorCamera(ctx: SetupContext, plane: SlicePlane): { position: Vec3; target: Vec3; up: Vec3 } {
  const { center, maxExtent } = physicalFraming(ctx)
  const distance = maxExtent * NAVIGATOR_DISTANCE_FACTOR
  if (plane === 'xy') {
    return {
      position: [center[0] - distance, center[1], center[2]],
      target: center,
      up: [0, 1, 0],
    }
  }
  if (plane === 'yz') {
    return {
      position: [center[0], center[1] - distance, center[2]],
      target: center,
      up: [0, 0, 1],
    }
  }
  return {
    position: [center[0] + distance, center[1], center[2]],
    target: center,
    up: [0, 0, 1],
  }
}

export interface BuildNavigatorOptions {
  ctx: SetupContext
  plane: SlicePlane
  canvas: HTMLCanvasElement
  channel?: number | null
}

export async function buildNavigatorOverview(options: BuildNavigatorOptions): Promise<Galavi> {
  const { ctx, plane, canvas } = options
  const channel = options.channel === undefined ? ctx.initCh : options.channel

  if (!ctx.hasMesh || ctx.meshDownsampleFactor === null) {
    const fallbackPlane: SlicePlane = plane === 'xy' ? 'xz' : plane === 'yz' ? 'xy' : 'yz'
    return buildSliceViewer({
      ctx,
      plane: fallbackPlane,
      channel,
      sliceIndex: Math.floor(ctx.sliceSources[fallbackPlane].pyramid.levels[0].shape[sliceDef(fallbackPlane).axisMap[2]] / 2),
      canvas,
      interactive: false,
    })
  }

  const { size, unit } = physicalFraming(ctx)
  const meshSize = makeMeshDataSize(ctx)
  const camera = navigatorCamera(ctx, plane)

  const layers: LayerConfig[] = [
    {
      id: 'surface',
      type: 'surface',
      data: { url: ctx.meshUrl },
      options: { dataSize: meshSize },
      render: {
        color: '#C7CCD6',
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

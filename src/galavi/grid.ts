import {
  createGalavi,
  type Galavi,
  type LayerConfig,
  type State,
  type Vec2,
  type ViewConfig,
} from 'galavi'
import {
  fitSliceCamera,
  physicalFraming,
  sliceData,
  sliceDef,
  sliceSource,
  storageSliceIndex,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'

export function cellLayerId(index: number): string {
  return `cell_${index}`
}

function makeCellLayer(
  ctx: SetupContext,
  plane: SlicePlane,
  index: number,
  channel: number,
  sliceIndex: number,
  contrast: Vec2,
): LayerConfig {
  const definition = sliceDef(ctx, plane)
  const source = sliceSource(ctx, plane)
  return {
    id: cellLayerId(index),
    type: 'slice',
    data: sliceData(ctx, plane),
    options: {
      axes: definition.axes,
      sliceIndex: storageSliceIndex(ctx, plane, sliceIndex),
      selection: { ...source.info.defaultSelection, c: channel },
    },
    render: {
      visible: true,
      colormap: 'gray',
      contrastLimits: contrast,
      blending: 'additive',
    },
  } as LayerConfig
}

export interface BuildGridOptions {
  ctx: SetupContext
  plane: SlicePlane
  channel: number
  contrast: Vec2
  poolSize: number
  initialSlices: number[]
  canvases: (HTMLCanvasElement | null)[]
}

export async function buildGrid(options: BuildGridOptions): Promise<Galavi> {
  const { ctx, plane, channel, poolSize, initialSlices, canvases } = options
  const camera = fitSliceCamera(ctx, plane)
  const { size, unit } = physicalFraming(ctx)
  const contrast = options.contrast
  const layers: LayerConfig[] = []
  const views: Record<string, ViewConfig> = {}

  for (let index = 0; index < poolSize; index++) {
    const id = cellLayerId(index)
    layers.push(makeCellLayer(ctx, plane, index, channel, initialSlices[index] ?? 0, contrast))
    views[id] = {
      type: 'slice',
      layers: [id],
      activatable: false,
      ...(canvases[index] ? { canvas: canvases[index]! } : {}),
    }
  }

  const state: State = {
    physical: { spatial: { size, unit } },
    layers,
    exploration: {
      camera: {
        navMode: 'fly',
        projMode: 'orthographic',
        position: camera.position,
        target: camera.target,
      },
    },
  }
  return createGalavi({ state, views })
}
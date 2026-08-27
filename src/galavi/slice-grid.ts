/**
 * Slice grid — the app-owned grid controller: a fixed pool of slice views
 * over ONE image-pyramid resource,
 * hand-built on the low-level runtime (`createViewerRuntime`) — the same level
 * cerevi drives everywhere else (see standalone-builders.ts/view-factories.ts).
 * GridMode.vue keeps the Vue-owned cell DOM, responsive pool sizing, page
 * strip, and route state; this module owns the runtime scene (one additive
 * slice layer per pool cell per channel, one slice view per cell), the
 * deferred mount, and the batched page-turn/channel transactions (one
 * `updateLayers` commit per batch).
 *
 * Layer IDs are keyed by channel SLOT (`grid-cell-N-cS`), not channel index,
 * so a channel switch patches the existing layers in place instead of
 * requiring a rebuild.
 */

import {
  createViewerRuntime,
  type AxisMap,
  type Camera,
  type DatasetChannel,
  type DeepPartial,
  type GalaviTheme,
  type ImagePyramidResource,
  type LayerConfig,
  type LayerPatch,
  type PhysicalSpace,
  type State,
  type ViewConfig,
  type ViewerRuntime,
} from 'galavi'

export interface CreateSliceGridOptions {
  /** The image resource every cell renders (cerevi: a precomputed plane store). */
  source: ImagePyramidResource
  /** [u, v, slice] -> storage axes of the anatomical view the source feeds. */
  axes: AxisMap
  /** Channels composited per cell (one additive slice layer per channel slot). */
  channels: DatasetChannel[]
  /**
   * One STORAGE-space slice per pool slot; `undefined` hides an unused tail
   * slot. The array length IS the pool size.
   */
  slices: (number | undefined)[]
  /** Layer transform (voxel -> physical); defaults to the layer's own handling. */
  transform?: number[]
  physical: PhysicalSpace
  camera: Camera
  theme?: DeepPartial<GalaviTheme>
}

/**
 * The pool controller: the runtime plus the batched slice/channel updates.
 * Built GPU-initialized but UNMOUNTED — call `mount(canvases)` once the target
 * canvases are free (a previous grid owning them destroyed first).
 */
export interface SliceGrid {
  readonly runtime: ViewerRuntime
  mount(canvases: HTMLCanvasElement[]): Promise<void>
  setSlices(slices: (number | undefined)[]): void
  setChannels(channels: DatasetChannel[]): void
  destroy(): void
}

function cellViewId(index: number): string {
  return `grid-cell-${index}`
}

function cellLayerId(cell: number, slot: number): string {
  return `grid-cell-${cell}-c${slot}`
}

export async function createSliceGrid(options: CreateSliceGridOptions): Promise<SliceGrid> {
  const { source, axes, transform, physical, camera, theme } = options
  const pool = options.slices.length
  if (pool === 0) throw new Error('createSliceGrid: slices must contain at least one slot')
  if (options.channels.length === 0) throw new Error('createSliceGrid: at least one channel is required')

  const layers: LayerConfig[] = []
  const views: Record<string, ViewConfig> = {}
  for (let cell = 0; cell < pool; cell++) {
    const slice = options.slices[cell]
    const layerIds = options.channels.map((channel, slot) => {
      const id = cellLayerId(cell, slot)
      layers.push({
        id,
        type: 'slice',
        data: {
          fetch: source.fetch,
          pyramid: source.pyramid,
          ...(transform !== undefined ? { transform } : {}),
        },
        options: {
          axes: [...axes],
          sliceIndex: slice ?? 0,
          selection: { ...source.defaultSelection, c: channel.index },
        },
        render: {
          // A hidden slot suppresses every channel of the cell; re-showing it
          // restores each channel's own configured visibility.
          visible: slice !== undefined && channel.visible,
          color: channel.color,
          contrastLimits: [...channel.contrast] as [number, number],
          blending: 'additive',
        },
      })
      return id
    })
    views[cellViewId(cell)] = {
      type: 'slice',
      layers: layerIds,
      // Grid cells are non-interactive (GridMode pages; nobody focuses a cell).
      activatable: false,
    }
  }

  const state: State = {
    physical,
    layers,
    exploration: { camera },
  }
  // Canvasless creation + explicit GPU init: a failed build rejects BEFORE the
  // caller touches the live grid's canvases (GPU init is the realistic
  // failure point) — the previous grid keeps running.
  const runtime = await createViewerRuntime({ state, views, ...(theme ? { theme } : {}) })
  try {
    await runtime.initGPU()
  } catch (err) {
    runtime.destroy()
    throw err
  }

  // Live bookkeeping for the batched updates: setSlices preserves channel
  // visibility, setChannels preserves slot visibility.
  const cellVisible = options.slices.map((slice) => slice !== undefined)
  let channels = options.channels

  return {
    runtime,
    async mount(canvases: HTMLCanvasElement[]): Promise<void> {
      if (canvases.length !== pool) {
        throw new Error(`slice grid mount: expected ${pool} canvases, got ${canvases.length}`)
      }
      await runtime.mountAll(
        Object.fromEntries(canvases.map((canvas, index) => [cellViewId(index), canvas])),
      )
    },
    /** One batched transaction for a whole page turn. */
    setSlices(slices: (number | undefined)[]): void {
      if (slices.length !== pool) {
        throw new Error(`slice grid setSlices: expected ${pool} slots, got ${slices.length}`)
      }
      const patches: LayerPatch[] = []
      for (let cell = 0; cell < pool; cell++) {
        const slice = slices[cell]
        cellVisible[cell] = slice !== undefined
        for (let slot = 0; slot < channels.length; slot++) {
          patches.push({
            id: cellLayerId(cell, slot),
            options: { sliceIndex: slice ?? 0 },
            render: { visible: slice !== undefined && channels[slot]!.visible },
          })
        }
      }
      runtime.updateLayers(patches)
    },
    /** One batched transaction for a channel selection/contrast change. */
    setChannels(next: DatasetChannel[]): void {
      if (next.length !== channels.length) {
        throw new Error(
          `slice grid setChannels: channel count changed (${channels.length} -> ${next.length}) — ` +
          'rebuild the grid instead',
        )
      }
      const patches: LayerPatch[] = []
      for (let cell = 0; cell < pool; cell++) {
        next.forEach((channel, slot) => {
          patches.push({
            id: cellLayerId(cell, slot),
            options: { selection: { c: channel.index } },
            render: {
              color: channel.color,
              contrastLimits: [...channel.contrast] as [number, number],
              visible: cellVisible[cell]! && channel.visible,
            },
          })
        })
      }
      channels = next
      runtime.updateLayers(patches)
    },
    destroy(): void {
      runtime.destroy()
    },
  }
}

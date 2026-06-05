/**
 * useCompositorState — per-channel appearance + perspective/slice state for the
 * Compositor mode.
 *
 * Unlike Explorer (single-channel select + one global contrast), the Compositor
 * composites every channel at once. Each channel carries its own color, contrast
 * range and visibility, shared across all three perspectives (xy/yz/xz). Only one
 * perspective view is mounted to the single canvas at a time; switching unmounts
 * the old view and mounts the new one.
 */

import { reactive, ref } from 'vue'
import type { Galavi, Vec2, Vec3 } from 'galavi'
import {
  type SetupContext,
  type CompositorPerspective,
  SLICE_DEFS,
  compositorLayerId,
  compositorSliceMax,
  compositorInitialSlice,
  getCompositorChannelDefaults,
} from '@/galavi-setup'

export interface CompositorChannel {
  index: number
  label: string
  color: string
  contrastMin: number
  contrastMax: number
  bounds: Vec2
  visible: boolean
}

export interface CompositorSliceEntry {
  label: string
  value: number
  max: number
  axisMap: Vec3
}

function channelLabel(ctx: SetupContext, i: number): string {
  const info = ctx.volumeInfo
  if (info.omeroChannelLabels?.[i]) return info.omeroChannelLabels[i]
  const c = info.selectionDims.find((d) => d.name === 'c')
  if (c?.labels?.[i]) return c.labels[i]
  return `Channel ${i}`
}

export function useCompositorState(
  getGalavi: () => Galavi | undefined,
  getCanvas: () => HTMLCanvasElement | null,
) {
  let currentCtx: SetupContext | undefined
  const perspective = ref<CompositorPerspective>('xy')
  const channels = reactive<CompositorChannel[]>([])
  const slices = reactive<Record<string, CompositorSliceEntry>>({})

  function setSetupContext(ctx: SetupContext) {
    currentCtx = ctx
    perspective.value = 'xy'

    const defaults = getCompositorChannelDefaults(ctx)
    channels.splice(0, channels.length)
    for (let i = 0; i < ctx.channelCount; i++) {
      const d = defaults[i]
      // Slider range mirrors Explorer's deriveBounds: shrink to ~4× the default
      // window so the slider stays usefully resolved over the dim fluorescence tail.
      const hi = Math.min(1, Math.max(d.contrastLimits[1] * 4, d.contrastLimits[1] + 0.001))
      channels.push({
        index: i,
        label: channelLabel(ctx, i),
        color: d.color,
        contrastMin: d.contrastLimits[0],
        contrastMax: d.contrastLimits[1],
        bounds: [0, hi],
        visible: d.visible,
      })
    }

    for (const k of Object.keys(slices)) delete slices[k]
    for (const def of SLICE_DEFS) {
      const key = def.key as CompositorPerspective
      slices[key] = {
        label: `${def.anatomicalLabel} (${key.toUpperCase()})`,
        value: compositorInitialSlice(ctx, key),
        max: compositorSliceMax(ctx, key),
        axisMap: def.axisMap,
      }
    }
  }

  /** Push the full composable state onto every perspective's layers. */
  function applyAll() {
    const galavi = getGalavi()
    if (!galavi) return
    for (const def of SLICE_DEFS) {
      const key = def.key as CompositorPerspective
      const sliceIndex = slices[key]?.value ?? 0
      for (const ch of channels) {
        const layer = galavi.layer(compositorLayerId(key, ch.index))
        layer?.setRender({
          color: ch.color,
          contrastLimits: [ch.contrastMin, ch.contrastMax] as Vec2,
          visible: ch.visible,
        })
        layer?.setOptions({ sliceIndex })
      }
    }
  }

  function setChannelColor(index: number, color: string) {
    const ch = channels.find((c) => c.index === index)
    if (!ch) return
    ch.color = color
    const galavi = getGalavi()
    if (!galavi) return
    for (const def of SLICE_DEFS) galavi.layer(compositorLayerId(def.key, index))?.setRender({ color })
  }

  function setChannelContrast(index: number, min: number, max: number) {
    const ch = channels.find((c) => c.index === index)
    if (!ch) return
    const lo = Math.max(ch.bounds[0], Math.min(min, max))
    const hi = Math.min(ch.bounds[1], Math.max(min, max))
    ch.contrastMin = lo
    ch.contrastMax = hi
    const galavi = getGalavi()
    if (!galavi) return
    for (const def of SLICE_DEFS) {
      galavi.layer(compositorLayerId(def.key, index))?.setRender({ contrastLimits: [lo, hi] as Vec2 })
    }
  }

  function setChannelVisible(index: number, visible: boolean) {
    const ch = channels.find((c) => c.index === index)
    if (!ch) return
    ch.visible = visible
    const galavi = getGalavi()
    if (!galavi) return
    for (const def of SLICE_DEFS) galavi.layer(compositorLayerId(def.key, index))?.setRender({ visible })
  }

  function syncTargetToSlice(key: CompositorPerspective) {
    const galavi = getGalavi()
    if (!galavi || !currentCtx) return
    const slice = slices[key]
    if (!slice) return
    const am = slice.axisMap
    const info = currentCtx.sliceSources[key].info
    const physicalPos = (slice.value + 0.5) * info.transform.scale[am[2]]
    const target = [...galavi.getState().exploration.camera.target] as Vec3
    target[am[2]] = physicalPos
    galavi.setTarget(target)
  }

  function setSliceValue(key: CompositorPerspective, value: number) {
    const slice = slices[key]
    if (!slice) return
    slice.value = Math.max(0, Math.min(slice.max, Math.round(value)))
    const galavi = getGalavi()
    if (galavi) {
      for (const ch of channels) {
        galavi.layer(compositorLayerId(key, ch.index))?.setOptions({ sliceIndex: slice.value })
      }
    }
    syncTargetToSlice(key)
  }

  async function setPerspective(key: CompositorPerspective) {
    if (key === perspective.value) return
    const prev = perspective.value
    perspective.value = key
    const galavi = getGalavi()
    const canvas = getCanvas()
    if (!galavi || !canvas) return
    galavi.unmount(prev)
    await galavi.mount(key, canvas)
    galavi.setActiveView(key)
    syncTargetToSlice(key)
    galavi.requestRender()
  }

  return {
    perspective,
    channels,
    slices,
    setSetupContext,
    applyAll,
    setChannelColor,
    setChannelContrast,
    setChannelVisible,
    setSliceValue,
    setPerspective,
  }
}

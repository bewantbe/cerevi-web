/**
 * useSliceState — slice-derived state, channel/contrast/slice change handlers.
 */

import { ref, reactive } from 'vue'
import type { Galavi, Vec2, Vec3 } from 'galavi'
import { type SetupContext, SLICE_DEFS, IMAGERY_IDS } from '@/galavi-setup'

export interface SliceEntry {
  label: string
  value: number
  max: number
  dataId: string
  axisMap: Vec3
}

function buildSlices(ctx: SetupContext): Record<string, SliceEntry> {
  const out: Record<string, SliceEntry> = {}
  // Each slice slider walks its own slice source's slice-axis dimension.
  for (const def of SLICE_DEFS) {
    const pyramid = ctx.sliceSources[def.key as 'xy' | 'xz' | 'yz'].pyramid
    const sliceAxis = def.axisMap[2]
    const total = pyramid.levels[0].shape[sliceAxis]
    out[def.key] = {
      label: `${def.anatomicalLabel} (${def.key.toUpperCase()})`,
      value: Math.floor(total / 2),
      max: Math.max(0, total - 1),
      dataId: def.layerId,
      axisMap: def.axisMap,
    }
  }
  return out
}

function deriveBounds(ctx: SetupContext | undefined): Vec2 {
  // Slider operates in adapter-normalized units ([0,1] = full dtype range,
  // e.g. 0..65535 for uint16). Default `conRange` comes from
  // omero.channels[0].window.start/end. To keep slider resolution useful we
  // shrink the slider span to ~4x the default range, capped to [0, 1].
  if (!ctx) return [0, 1]
  const hi = Math.min(1, Math.max(ctx.conRange[1] * 4, ctx.conRange[1] + 0.001))
  return [0, hi]
}

export function useSliceState(getGalavi: () => Galavi | undefined, ctx?: SetupContext) {
  let currentCtx: SetupContext | undefined = ctx
  const channels = reactive<number[]>(
    ctx ? Array.from({ length: ctx.channelCount }, (_, i) => i) : [],
  )
  const channel = ref(ctx?.initCh ?? 0)
  const contrastBounds = ref<Vec2>(deriveBounds(ctx))
  const contrastStep = ref(0.001)
  const contrastMin = ref(ctx ? Math.max(contrastBounds.value[0], ctx.conRange[0]) : 0)
  const contrastMax = ref(ctx ? Math.min(contrastBounds.value[1], ctx.conRange[1]) : 1)
  const slices = reactive<Record<string, SliceEntry>>(ctx ? buildSlices(ctx) : {})

  function setSetupContext(nextCtx: SetupContext) {
    currentCtx = nextCtx

    channel.value = nextCtx.initCh
    contrastBounds.value = deriveBounds(nextCtx)
    contrastStep.value = Math.max(1e-5, contrastBounds.value[1] / 1000)
    contrastMin.value = Math.max(contrastBounds.value[0], nextCtx.conRange[0])
    contrastMax.value = Math.min(contrastBounds.value[1], nextCtx.conRange[1])

    channels.splice(0, channels.length)
    for (let i = 0; i < nextCtx.channelCount; i++) channels.push(i)

    const next = buildSlices(nextCtx)
    for (const key of Object.keys(slices)) delete slices[key]
    for (const [k, v] of Object.entries(next)) slices[k] = v
  }

  function onChannelChange() {
    const galavi = getGalavi()
    if (!galavi) return
    for (const id of IMAGERY_IDS) {
      galavi.layer(id)?.setOptions({ selection: { c: channel.value } })
    }
  }

  function onContrastChange() {
    const galavi = getGalavi()
    if (!galavi || !currentCtx) return
    const [lo0, hi0] = contrastBounds.value
    const lo = Math.max(lo0, Math.min(contrastMin.value, contrastMax.value))
    const hi = Math.min(hi0, Math.max(contrastMin.value, contrastMax.value))
    contrastMin.value = lo
    contrastMax.value = hi
    // Slider operates in the volume's autoContrast units. For each imagery
    // layer, scale the slider value by (layerAuto / volumeAuto) so the slices
    // (max-projection, ~1.5–2× hotter) and the volume (mean-downsampled)
    // each map to their own intended display range from a single control.
    const refHi = currentCtx.imageryAutoContrast.volume[1] || 1
    for (const id of IMAGERY_IDS) {
      const layerHi = currentCtx.imageryAutoContrast[id]?.[1] ?? refHi
      const k = layerHi / refHi
      galavi.layer(id)?.setRender({ contrastLimits: [lo * k, hi * k] as Vec2 })
    }
  }

  function onSliceChange(key: string) {
    const galavi = getGalavi()
    if (!galavi || !currentCtx) return
    const slice = slices[key]
    if (!slice) return
    galavi.layer(slice.dataId)?.setOptions({ sliceIndex: slice.value })

    // Sync volume camera target to slice's physical position. The slice
    // source and volume share the same physical space, but each slice axis
    // has its own scale (typically the slice stride, e.g. 20µm for visor projections).
    const am = slice.axisMap
    const sliceInfo = currentCtx.sliceSources[key as 'xy' | 'xz' | 'yz'].info
    const scale = sliceInfo.pyramid.levels[0].scale[am[2]]
    const physicalPos = sliceInfo.origin[am[2]] + (slice.value + 0.5) * scale
    const newTarget: Vec3 = [...galavi.getState().exploration.camera.target] as Vec3
    newTarget[am[2]] = physicalPos
    galavi.setTarget(newTarget)
  }

  function setSliceValue(key: string, value: number) {
    const slice = slices[key]
    if (!slice) return
    slice.value = Math.max(0, Math.min(slice.max, Math.round(value)))
    onSliceChange(key)
  }

  return {
    channels,
    channel,
    contrastBounds,
    contrastStep,
    contrastMin,
    contrastMax,
    slices,
    setSetupContext,
    setSliceValue,
    onChannelChange,
    onContrastChange,
    onSliceChange,
  }
}

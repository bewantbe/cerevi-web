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
  const ds = ctx.volumeInfo.dataSize
  for (const def of SLICE_DEFS) {
    const sliceAxis = def.axisMap[2]
    const total = ds[sliceAxis]
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

export function useSliceState(getGalavi: () => Galavi | undefined, ctx?: SetupContext) {
  let currentCtx: SetupContext | undefined = ctx
  const channels: number[] = ctx ? Array.from({ length: ctx.channelCount }, (_, i) => i) : []
  const channel = ref(ctx?.initCh ?? 0)
  const contrastBounds: Vec2 = [0, 1]
  const contrastStep = 0.001
  const contrastMin = ref(ctx ? Math.max(contrastBounds[0], ctx.conRange[0]) : 0)
  const contrastMax = ref(ctx ? Math.min(contrastBounds[1], ctx.conRange[1]) : 1)
  const slices = reactive<Record<string, SliceEntry>>(ctx ? buildSlices(ctx) : {})

  function setSetupContext(nextCtx: SetupContext) {
    currentCtx = nextCtx

    channel.value = nextCtx.initCh
    contrastMin.value = Math.max(contrastBounds[0], nextCtx.conRange[0])
    contrastMax.value = Math.min(contrastBounds[1], nextCtx.conRange[1])

    channels.length = 0
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
    if (!galavi) return
    const lo = Math.max(contrastBounds[0], Math.min(contrastMin.value, contrastMax.value))
    const hi = Math.min(contrastBounds[1], Math.max(contrastMin.value, contrastMax.value))
    contrastMin.value = lo
    contrastMax.value = hi
    const range: Vec2 = [lo, hi]
    for (const id of IMAGERY_IDS) {
      galavi.layer(id)?.setRender({ contrastLimits: range })
    }
  }

  function onSliceChange(key: string) {
    const galavi = getGalavi()
    if (!galavi || !currentCtx) return
    const slice = slices[key]
    if (!slice) return
    galavi.layer(slice.dataId)?.setOptions({ sliceIndex: slice.value })

    // Sync volume camera target to slice's physical position.
    const am = slice.axisMap
    const scale = currentCtx.volumeInfo.transform.scale
    const physicalPos = (slice.value + 0.5) * scale[am[2]]
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

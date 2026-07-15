import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Vec2, Vec3 } from 'galavi'
import VISoRAPI from '@/services/api'
import type { Specimen } from '@/types'
import {
  buildSetupContext,
  contrastBounds,
  initialSlice,
  physicalFraming,
  sliceCount,
  sliceDef,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'

export const VIEW_MODES = ['volume', 'quadrant', 'slice', 'grid'] as const
export type ViewMode = (typeof VIEW_MODES)[number]

export const TOOL_NAMES = ['ruler', 'magnifier', 'selector'] as const
export type ToolName = (typeof TOOL_NAMES)[number]

export interface GalleryChannel {
  index: number
  label: string
  color: string
  contrastMin: number
  contrastMax: number
  bounds: Vec2
  visible: boolean
}

export interface PhysicalSelection {
  min: Vec3
  max: Vec3
}

export const useVISoRStore = defineStore('visor', () => {
  const currentSpecimen = ref<Specimen | null>(null)
  const specimens = ref<Specimen[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const setupCtx = ref<SetupContext | null>(null)
  const ctxLoading = ref(false)
  const mode = ref<ViewMode>('volume')
  const enabledTools = ref<Record<ToolName, boolean>>({
    ruler: true,
    magnifier: false,
    selector: false,
  })
  const plane = ref<SlicePlane>('xy')
  const channel = ref(0)
  const contrastMin = ref(0)
  const contrastMax = ref(1)
  const contrastRange = ref<Vec2>([0, 1])
  const galleryChannels = reactive<GalleryChannel[]>([])
  const sliceByPlane = ref<Record<SlicePlane, number>>({ xy: 0, yz: 0, xz: 0 })
  const centerPosition = ref<Vec3>([0, 0, 0])
  const cursorPosition = ref<Vec3 | null>(null)
  const selection = ref<PhysicalSelection | null>(null)
  const rulerResetNonce = ref(0)
  const currentSlice = computed(() => sliceByPlane.value[plane.value])
  const positionReadout = ref('—')
  const resolutionReadout = ref('—')
  const volumeInfo = computed(() => setupCtx.value?.volumeInfo ?? null)
  let specimensRequest: Promise<void> | null = null
  let setupToken = 0

  async function loadSpecimens() {
    if (specimensRequest) return specimensRequest

    loading.value = true
    error.value = null

    specimensRequest = (async () => {
      try {
        specimens.value = await VISoRAPI.getSpecimens()
      } catch (err) {
        error.value = 'Failed to load specimens'
        console.error(err)
      } finally {
        loading.value = false
        specimensRequest = null
      }
    })()

    return specimensRequest
  }

  function setCurrentSpecimen(specimenId: string) {
    const specimen = specimens.value.find((entry) => entry.id === specimenId) ?? null
    currentSpecimen.value = specimen
    error.value = specimen ? null : 'Specimen not found'
  }

  function applyContext(ctx: SetupContext) {
    setupCtx.value = ctx
    plane.value = 'xy'
    channel.value = ctx.initCh
    contrastRange.value = contrastBounds(ctx.conRange)
    contrastMin.value = Math.max(contrastRange.value[0], ctx.conRange[0])
    contrastMax.value = Math.min(contrastRange.value[1], ctx.conRange[1])

    galleryChannels.splice(0, galleryChannels.length)
    for (const entry of ctx.channels) {
      const bounds = contrastBounds(entry.contrastLimits)
      galleryChannels.push({
        ...entry,
        contrastMin: entry.contrastLimits[0],
        contrastMax: entry.contrastLimits[1],
        bounds,
        visible: true,
      })
    }

    sliceByPlane.value = {
      xy: initialSlice(ctx, 'xy'),
      yz: initialSlice(ctx, 'yz'),
      xz: initialSlice(ctx, 'xz'),
    }
    const center = [...physicalFraming(ctx).center] as Vec3
    for (const slicePlane of ['xy', 'yz', 'xz'] as SlicePlane[]) {
      center[sliceDef(slicePlane).axisMap[2]] = positionForSlice(slicePlane, sliceByPlane.value[slicePlane])
    }
    centerPosition.value = clampPosition(center)
    cursorPosition.value = null
    selection.value = null
    rulerResetNonce.value += 1
  }

  async function selectSpecimen(specimenId: string) {
    const token = ++setupToken
    setCurrentSpecimen(specimenId)
    setupCtx.value = null
    cursorPosition.value = null
    selection.value = null
    if (!currentSpecimen.value) return

    ctxLoading.value = true
    try {
      const ctx = await buildSetupContext(currentSpecimen.value)
      if (token !== setupToken) return
      applyContext(ctx)
    } catch (err) {
      if (token !== setupToken) return
      error.value = 'Failed to load image data'
      console.error(err)
    } finally {
      if (token === setupToken) ctxLoading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  function setMode(nextMode: ViewMode) {
    mode.value = nextMode
    cursorPosition.value = null
  }

  function toggleTool(tool: ToolName) {
    if (!isToolAvailable(tool)) return
    enabledTools.value[tool] = !enabledTools.value[tool]
  }

  function isToolAvailable(tool: ToolName) {
    return mode.value !== 'grid' && !(tool === 'selector' && mode.value === 'volume')
  }

  function isToolEnabled(tool: ToolName) {
    return isToolAvailable(tool) && enabledTools.value[tool]
  }

  function setPlane(nextPlane: SlicePlane) {
    plane.value = nextPlane
  }

  function setChannel(nextChannel: number) {
    const max = Math.max(0, (setupCtx.value?.channelCount ?? 1) - 1)
    channel.value = Math.max(0, Math.min(max, Math.round(nextChannel)))
  }

  function setContrast(range: Vec2) {
    const low = Math.max(contrastRange.value[0], Math.min(contrastRange.value[1], range[0]))
    const high = Math.max(low, Math.min(contrastRange.value[1], range[1]))
    contrastMin.value = low
    contrastMax.value = high
  }

  function physicalBounds(ctx: SetupContext): PhysicalSelection {
    const { center, size } = physicalFraming(ctx)
    return {
      min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
      max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
    }
  }

  function clampPosition(position: Vec3): Vec3 {
    const ctx = setupCtx.value
    if (!ctx) return [...position] as Vec3
    const bounds = physicalBounds(ctx)
    return position.map((value, axis) => Math.max(bounds.min[axis], Math.min(bounds.max[axis], value))) as Vec3
  }

  function sliceForPosition(slicePlane: SlicePlane, position: Vec3): number {
    const ctx = setupCtx.value
    if (!ctx) return 0
    const axis = sliceDef(slicePlane).axisMap[2]
    const count = Math.max(1, sliceCount(ctx, slicePlane))
    const source = ctx.sliceSources[slicePlane]
    const origin = source.info.origin[axis]
    const scale = source.pyramid.levels[0].scale[axis]
    const index = scale > 0 ? Math.round((position[axis] - origin) / scale - 0.5) : 0
    return Math.max(0, Math.min(count - 1, index))
  }

  function positionForSlice(slicePlane: SlicePlane, index: number): number {
    const ctx = setupCtx.value
    if (!ctx) return 0
    const axis = sliceDef(slicePlane).axisMap[2]
    const count = Math.max(1, sliceCount(ctx, slicePlane))
    const clamped = Math.max(0, Math.min(count - 1, Math.round(index)))
    const source = ctx.sliceSources[slicePlane]
    const origin = source.info.origin[axis]
    const scale = source.pyramid.levels[0].scale[axis]
    if (scale > 0) return origin + (clamped + 0.5) * scale
    return physicalFraming(ctx).center[axis]
  }

  function setCenter(position: Vec3) {
    const next = clampPosition(position)
    centerPosition.value = next
    sliceByPlane.value = {
      xy: sliceForPosition('xy', next),
      yz: sliceForPosition('yz', next),
      xz: sliceForPosition('xz', next),
    }
  }

  function setSlice(slicePlane: SlicePlane, index: number) {
    const ctx = setupCtx.value
    if (!ctx) return
    const max = Math.max(0, sliceCount(ctx, slicePlane) - 1)
    const nextIndex = Math.max(0, Math.min(max, Math.round(index)))
    sliceByPlane.value = { ...sliceByPlane.value, [slicePlane]: nextIndex }
    const axis = sliceDef(slicePlane).axisMap[2]
    const nextCenter = [...centerPosition.value] as Vec3
    nextCenter[axis] = positionForSlice(slicePlane, nextIndex)
    centerPosition.value = nextCenter
  }

  function setCursor(position: Vec3 | null) {
    cursorPosition.value = position ? clampPosition(position) : null
  }

  function setSelection(nextSelection: PhysicalSelection | null) {
    if (!nextSelection) {
      selection.value = null
      return
    }
    const first = clampPosition(nextSelection.min)
    const second = clampPosition(nextSelection.max)
    selection.value = {
      min: first.map((value, axis) => Math.min(value, second[axis])) as Vec3,
      max: first.map((value, axis) => Math.max(value, second[axis])) as Vec3,
    }
  }

  function resetRuler() {
    enabledTools.value.ruler = true
    rulerResetNonce.value += 1
  }

  function setReadouts(position: string, resolution: string) {
    positionReadout.value = position
    resolutionReadout.value = resolution
  }

  function clearReadouts() {
    positionReadout.value = '—'
    resolutionReadout.value = '—'
  }

  function clearVolumeInfo() {
    setupCtx.value = null
  }

  function initialize() {
    loadSpecimens()
  }

  return {
    currentSpecimen,
    specimens,
    loading,
    error,
    setupCtx,
    ctxLoading,
    mode,
    enabledTools,
    plane,
    channel,
    contrastMin,
    contrastMax,
    contrastRange,
    galleryChannels,
    sliceByPlane,
    centerPosition,
    cursorPosition,
    selection,
    rulerResetNonce,
    currentSlice,
    positionReadout,
    resolutionReadout,
    volumeInfo,
    loadSpecimens,
    setCurrentSpecimen,
    selectSpecimen,
    clearError,
    setMode,
    toggleTool,
    isToolAvailable,
    isToolEnabled,
    setPlane,
    setChannel,
    setContrast,
    setCenter,
    setSlice,
    setCursor,
    setSelection,
    resetRuler,
    sliceForPosition,
    positionForSlice,
    setReadouts,
    clearReadouts,
    clearVolumeInfo,
    initialize,
  }
})

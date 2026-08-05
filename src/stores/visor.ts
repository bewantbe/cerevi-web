import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  clampContrastLimits,
  CONTRAST_RANGE,
  type RoiBox,
  type RoiSelectionChange,
  type Vec2,
  type Vec3,
} from 'galavi'
import CereviAPI from '@/services/api'
import type { Specimen } from '@/types'
import {
  buildSetupContext,
  imagerySourceForPlane,
  initialSlice,
  physicalFraming,
  sliceCount,
  sliceDef,
  type ImageryContrastLimits,
  type ImagerySource,
  type SetupContext,
  type SlicePlane,
} from '@/galavi-setup'
import * as coordinates from '@/lib/coordinates'
import type { PhysicalSelection } from '@/lib/coordinates'

export const VIEW_MODES = ['volume', 'quadrant', 'slice', 'grid'] as const
export type ViewMode = (typeof VIEW_MODES)[number]

export const TOOL_NAMES = ['ruler', 'crosshair', 'magnifier', 'selector'] as const
export type ToolName = (typeof TOOL_NAMES)[number]
export type MagnifierMode = '2d' | '3d' | null

export const NAV_MODES = ['orbit', 'fly'] as const
export type NavMode = (typeof NAV_MODES)[number]

export interface GalleryChannel {
  index: number
  label: string
  color: string
  contrastMin: number
  contrastMax: number
  visible: boolean
}

const IMAGERY_SOURCES: ImagerySource[] = ['volume', 'xy', 'xz', 'yz']

function defaultImageryContrastLimits(): ImageryContrastLimits {
  return { volume: [[0, 1]], xy: [[0, 1]], xz: [[0, 1]], yz: [[0, 1]] }
}

function cloneImageryContrastLimits(limits: ImageryContrastLimits): ImageryContrastLimits {
  return Object.fromEntries(IMAGERY_SOURCES.map((source) => [
    source,
    limits[source].map(clampContrastLimits),
  ])) as ImageryContrastLimits
}

export const useCereviStore = defineStore('visor', () => {
  const currentSpecimen = ref<Specimen | null>(null)
  const specimens = ref<Specimen[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const setupCtx = ref<SetupContext | null>(null)
  const ctxLoading = ref(false)
  const mode = ref<ViewMode>('volume')
  const navMode = ref<NavMode>('orbit')
  const enabledTools = ref<Record<ToolName, boolean>>({
    ruler: false,
    crosshair: false,
    magnifier: false,
    selector: false,
  })
  const magnifierMode = ref<MagnifierMode>(null)
  const magnifier3dPosition = ref<Vec3 | null>(null)
  const magnifier3dPlane = ref<SlicePlane | null>(null)
  const plane = ref<SlicePlane>('xy')
  const channel = ref(0)
  const activeImagerySource = ref<ImagerySource>('volume')
  const imageryContrastLimits = ref<ImageryContrastLimits>(defaultImageryContrastLimits())
  const galleryChannels = reactive<GalleryChannel[]>([])
  const sliceByPlane = ref<Record<SlicePlane, number>>({ xy: 0, yz: 0, xz: 0 })
  const centerPosition = ref<Vec3>([0, 0, 0])
  const cursorPosition = ref<Vec3 | null>(null)
  const selections = ref<PhysicalSelection[]>([])
  const activeSelectionIndex = ref<number | null>(null)
  const rulerResetNonce = ref(0)
  const currentSlice = computed(() => sliceByPlane.value[plane.value])
  const contrastMin = computed(() => contrastForSource(activeImagerySource.value, channel.value)[0])
  const contrastMax = computed(() => contrastForSource(activeImagerySource.value, channel.value)[1])
  const contrastRange = computed(() => [...CONTRAST_RANGE] as Vec2)
  const resolutionReadout = ref('—')
  const volumeInfo = computed(() => setupCtx.value?.volumeInfo ?? null)
  const channelColors = computed(() => setupCtx.value?.channels.map((entry) => entry.color) ?? [])
  let specimensRequest: Promise<void> | null = null
  let setupToken = 0

  async function loadSpecimens() {
    if (specimensRequest) return specimensRequest

    loading.value = true
    error.value = null

    specimensRequest = (async () => {
      try {
        specimens.value = await CereviAPI.getSpecimens()
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
    imageryContrastLimits.value = cloneImageryContrastLimits(ctx.imageryContrastLimits)
    setActiveImagerySource(mode.value === 'volume' || mode.value === 'quadrant'
      ? 'volume'
      : imagerySourceForPlane(ctx, plane.value))
    syncGalleryChannels(true)

    sliceByPlane.value = {
      xy: initialSlice(ctx, 'xy'),
      yz: initialSlice(ctx, 'yz'),
      xz: initialSlice(ctx, 'xz'),
    }
    const center = [...physicalFraming(ctx).center] as Vec3
    for (const slicePlane of ['xy', 'yz', 'xz'] as SlicePlane[]) {
      center[sliceDef(ctx, slicePlane).axisMap[2]] = positionForSlice(slicePlane, sliceByPlane.value[slicePlane])
    }
    centerPosition.value = clampPosition(center)
    cursorPosition.value = null
    magnifier3dPosition.value = null
    magnifier3dPlane.value = null
    selections.value = []
    activeSelectionIndex.value = null
    rulerResetNonce.value += 1
  }

  async function selectSpecimen(specimenId: string) {
    const token = ++setupToken
    setCurrentSpecimen(specimenId)
    setupCtx.value = null
    cursorPosition.value = null
    selections.value = []
    activeSelectionIndex.value = null
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
    if (nextMode !== mode.value) {
      for (const tool of TOOL_NAMES) enabledTools.value[tool] = false
      magnifierMode.value = null
      magnifier3dPosition.value = null
      magnifier3dPlane.value = null
    }
    mode.value = nextMode
    cursorPosition.value = null
    const ctx = setupCtx.value
    if (!ctx) return
    setActiveImagerySource(nextMode === 'volume' || nextMode === 'quadrant'
      ? 'volume'
      : imagerySourceForPlane(ctx, plane.value))
  }

  function setNavMode(nextNavMode: NavMode) {
    navMode.value = nextNavMode
  }

  function toggleTool(tool: ToolName) {
    if (!isToolAvailable(tool)) return
    if (tool === 'magnifier') {
      cycleMagnifierMode()
      return
    }
    enabledTools.value[tool] = !enabledTools.value[tool]
  }

  function cycleMagnifierMode() {
    if (!isToolAvailable('magnifier')) return
    const nextMode: MagnifierMode = magnifierMode.value === null
      ? '2d'
      : magnifierMode.value === '2d'
        ? '3d'
        : null
    setMagnifierMode(nextMode)
  }

  function setMagnifierMode(nextMode: MagnifierMode) {
    if (nextMode && !isToolAvailable('magnifier')) return
    magnifierMode.value = nextMode
    enabledTools.value.magnifier = nextMode !== null
    magnifier3dPosition.value = null
    magnifier3dPlane.value = null
  }

  function pinMagnifier3d(position: Vec3, sourcePlane: SlicePlane) {
    if (magnifierMode.value !== '3d') return
    magnifier3dPosition.value = clampPosition(position)
    magnifier3dPlane.value = sourcePlane
  }

  function isToolAvailable(tool: ToolName) {
    if (tool === 'crosshair') return mode.value === 'quadrant' || mode.value === 'slice'
    return mode.value !== 'grid' && !(tool === 'selector' && mode.value === 'volume')
  }

  function isToolEnabled(tool: ToolName) {
    return isToolAvailable(tool) && enabledTools.value[tool]
  }

  function setPlane(nextPlane: SlicePlane) {
    if (nextPlane !== plane.value) {
      magnifier3dPosition.value = null
      magnifier3dPlane.value = null
    }
    plane.value = nextPlane
    const ctx = setupCtx.value
    if (ctx && mode.value !== 'volume' && mode.value !== 'quadrant') {
      setActiveImagerySource(imagerySourceForPlane(ctx, nextPlane))
    }
    syncGalleryChannels()
  }

  function setChannel(nextChannel: number) {
    const max = Math.max(0, (setupCtx.value?.channelCount ?? 1) - 1)
    channel.value = Math.max(0, Math.min(max, Math.round(nextChannel)))
    clampSourceContrast(activeImagerySource.value)
  }

  function contrastForSource(source: ImagerySource, channelIndex = channel.value): Vec2 {
    return clampContrastLimits(imageryContrastLimits.value[source]?.[channelIndex])
  }

  function contrastForPlane(slicePlane: SlicePlane, channelIndex = channel.value): Vec2 {
    const ctx = setupCtx.value
    return ctx
      ? contrastForSource(imagerySourceForPlane(ctx, slicePlane), channelIndex)
      : [0, 1]
  }

  function setActiveImagerySource(source: ImagerySource) {
    clampSourceContrast(source)
    activeImagerySource.value = source
  }

  function clampSourceContrast(source: ImagerySource) {
    imageryContrastLimits.value = {
      ...imageryContrastLimits.value,
      [source]: imageryContrastLimits.value[source].map(clampContrastLimits),
    }
  }

  function updateContrast(source: ImagerySource, channelIndex: number, range: Vec2): Vec2 {
    const next = clampContrastLimits(range)
    const sourceLimits = [...imageryContrastLimits.value[source]]
    sourceLimits[channelIndex] = next
    imageryContrastLimits.value = { ...imageryContrastLimits.value, [source]: sourceLimits }
    return next
  }

  function setContrast(range: Vec2) {
    const next = updateContrast(activeImagerySource.value, channel.value, range)
    const ctx = setupCtx.value
    if (!ctx || imagerySourceForPlane(ctx, plane.value) !== activeImagerySource.value) return
    const galleryChannel = galleryChannels.find((entry) => entry.index === channel.value)
    if (galleryChannel) {
      galleryChannel.contrastMin = next[0]
      galleryChannel.contrastMax = next[1]
    }
  }

  function setGalleryChannelContrast(channelIndex: number, range: Vec2) {
    const ctx = setupCtx.value
    if (!ctx) return
    const next = updateContrast(imagerySourceForPlane(ctx, plane.value), channelIndex, range)
    const galleryChannel = galleryChannels.find((entry) => entry.index === channelIndex)
    if (galleryChannel) {
      galleryChannel.contrastMin = next[0]
      galleryChannel.contrastMax = next[1]
    }
  }

  function syncGalleryChannels(resetAppearance = false) {
    const ctx = setupCtx.value
    if (!ctx) return
    const previous = resetAppearance
      ? new Map<number, GalleryChannel>()
      : new Map(galleryChannels.map((entry) => [entry.index, entry]))
    const source = imagerySourceForPlane(ctx, plane.value)
    galleryChannels.splice(0, galleryChannels.length)
    for (const entry of ctx.channels) {
      const limits = contrastForSource(source, entry.index)
      const appearance = previous.get(entry.index)
      galleryChannels.push({
        ...entry,
        color: appearance?.color ?? entry.color,
        contrastMin: limits[0],
        contrastMax: limits[1],
        visible: appearance?.visible ?? true,
      })
    }
  }

  // Coordinate math lives in @/lib/coordinates (pure functions over a
  // SetupContext); these wrappers bind the current context and keep the
  // no-context fallbacks.
  function clampPosition(position: Vec3): Vec3 {
    const ctx = setupCtx.value
    if (!ctx) return [...position] as Vec3
    return coordinates.clampPosition(coordinates.physicalBounds(ctx), position)
  }

  function sliceForPosition(slicePlane: SlicePlane, position: Vec3): number {
    const ctx = setupCtx.value
    return ctx ? coordinates.sliceForPosition(ctx, slicePlane, position) : 0
  }

  function positionForSlice(slicePlane: SlicePlane, index: number): number {
    const ctx = setupCtx.value
    return ctx ? coordinates.positionForSlice(ctx, slicePlane, index) : 0
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
    const axis = sliceDef(ctx, slicePlane).axisMap[2]
    const nextCenter = [...centerPosition.value] as Vec3
    nextCenter[axis] = positionForSlice(slicePlane, nextIndex)
    centerPosition.value = nextCenter
    if (magnifier3dPosition.value && magnifier3dPlane.value === slicePlane) {
      const nextPin = [...magnifier3dPosition.value] as Vec3
      nextPin[axis] = nextCenter[axis]
      magnifier3dPosition.value = nextPin
    }
  }

  function setCursor(position: Vec3 | null) {
    cursorPosition.value = position ? clampPosition(position) : null
  }

  function clampSelection(nextSelection: PhysicalSelection): PhysicalSelection {
    const first = clampPosition(nextSelection.min)
    const second = clampPosition(nextSelection.max)
    return {
      min: first.map((value, axis) => Math.min(value, second[axis])) as Vec3,
      max: first.map((value, axis) => Math.max(value, second[axis])) as Vec3,
    }
  }

  function setSelections(
    nextSelections: RoiBox[],
    change?       : RoiSelectionChange,
    sourcePlane?  : SlicePlane,
  ) {
    const ctx = setupCtx.value
    const bounds = ctx ? coordinates.physicalBounds(ctx) : null
    selections.value = nextSelections.map((selection, index) => {
      const next = change?.kind === 'create' && change.index === index && sourcePlane && ctx && bounds
        ? coordinates.withDefaultSelectionDepth(
            selection,
            sliceDef(ctx, sourcePlane).axisMap,
            positionForSlice(sourcePlane, sliceByPlane.value[sourcePlane]),
            bounds,
          )
        : selection
      return clampSelection(next)
    })
    if (activeSelectionIndex.value !== null && activeSelectionIndex.value >= selections.value.length) {
      activeSelectionIndex.value = null
    }
  }

  function setActiveSelectionIndex(index: number | null) {
    const next = index === null ? null : Math.floor(index)
    activeSelectionIndex.value = next !== null && next >= 0 && next < selections.value.length ? next : null
  }

  function resetRuler() {
    enabledTools.value.ruler = true
    rulerResetNonce.value += 1
  }

  function setResolutionReadout(resolution: string) {
    resolutionReadout.value = resolution
  }

  function clearReadouts() {
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
    navMode,
    enabledTools,
    magnifierMode,
    magnifier3dPosition,
    magnifier3dPlane,
    plane,
    channel,
    activeImagerySource,
    contrastMin,
    contrastMax,
    contrastRange,
    galleryChannels,
    sliceByPlane,
    centerPosition,
    cursorPosition,
    selections,
    activeSelectionIndex,
    rulerResetNonce,
    currentSlice,
    resolutionReadout,
    volumeInfo,
    channelColors,
    loadSpecimens,
    setCurrentSpecimen,
    selectSpecimen,
    clearError,
    setMode,
    setNavMode,
    toggleTool,
    cycleMagnifierMode,
    setMagnifierMode,
    pinMagnifier3d,
    isToolAvailable,
    isToolEnabled,
    setPlane,
    setChannel,
    setActiveImagerySource,
    contrastForSource,
    contrastForPlane,
    setContrast,
    setGalleryChannelContrast,
    setCenter,
    setSlice,
    setCursor,
    setSelections,
    setActiveSelectionIndex,
    resetRuler,
    sliceForPosition,
    positionForSlice,
    setResolutionReadout,
    clearReadouts,
    clearVolumeInfo,
    initialize,
  }
})

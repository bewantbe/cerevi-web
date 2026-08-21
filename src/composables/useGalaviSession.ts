import {
  cameraDistance,
  screenToSlicePhysical,
  volumeUnitsPerPixel,
  type AxisMap,
  type RoiBox,
  type RoiSelectionChange,
  type State,
  type Vec3,
  type ViewerEngine,
} from 'galavi/advanced'
import { watch, type WatchStopHandle } from 'vue'
import type { SlicePlane } from '@/galavi-setup'
import { useCereviStore } from '@/stores/visor'

// ============================================================================
// Shared galavi session wiring for the viewer modes (cleanup plan 3.2/3.5, W1).
// Centralizes the rules that were triplicated across VolumeMode / SliceMode /
// QuadrantMode / SliceNavigator: token-guarded async builds, subscribe +
// echo-guard two-way binding, the effective-resolution readout, overlay-option
// synchronization, ResizeObserver wiring, and teardown. Mode-specific imagery
// and interaction policy stays in each mode component.
// ============================================================================

type CereviStore = ReturnType<typeof useCereviStore>

/** Epsilon comparison used by the echo guards in both binding directions. */
export function vec3Differ(first: Vec3, second: Vec3): boolean {
  return first.some((value, axis) => Math.abs(value - second[axis]) > 1e-5)
}

/** Normalize an unknown build rejection into a one-line message for error UI. */
export function describeBuildError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * Token guard + subscription + ResizeObserver + teardown for one galavi
 * session. The instance itself stays owned by the component (modes differ:
 * some rebuild, some swap views); this composable owns the wiring around it.
 */
export function useGalaviSession() {
  let buildToken = 0
  let unsubscribe: (() => void) | undefined
  let resizeObserver: ResizeObserver | undefined

  /** Start a new async build; pair with isBuildCurrent after each await. */
  function nextBuildToken(): number {
    return ++buildToken
  }

  function isBuildCurrent(token: number): boolean {
    return token === buildToken
  }

  /** Subscribe to galavi state, replacing any previous subscription. */
  function subscribeTo(engine: ViewerEngine, handler: (state: State) => void): void {
    unsubscribe?.()
    unsubscribe = engine.subscribe(handler)
  }

  /** Drop the current subscription (e.g. before destroying the instance). */
  function unsubscribeSession(): void {
    unsubscribe?.()
    unsubscribe = undefined
  }

  /** (Re)wire the ResizeObserver; disconnects any previous observation. */
  function observeResizes(targets: (Element | null | undefined)[], onResize: () => void): void {
    resizeObserver?.disconnect()
    resizeObserver = new ResizeObserver(onResize)
    for (const target of targets) if (target) resizeObserver.observe(target)
  }

  /** Invalidate builds, unwind subscription/observer, destroy the instance. */
  function teardownSession(instance?: ViewerEngine | null, store?: CereviStore): void {
    buildToken += 1
    unsubscribe?.()
    unsubscribe = undefined
    resizeObserver?.disconnect()
    resizeObserver = undefined
    instance?.destroy()
    if (store) {
      store.setCursor(null)
      store.clearReadouts()
    }
  }

  return {
    nextBuildToken,
    isBuildCurrent,
    subscribeTo,
    unsubscribeSession,
    observeResizes,
    teardownSession,
  }
}

// ============================================================================
// ECHO-GUARDED TWO-WAY BINDING
// ============================================================================

/**
 * Store → galavi: when the center position changes, push it into the camera
 * target unless it already matches (guard against feedback loops). `afterSync`
 * runs on every change, even when the target was already in sync.
 */
export function watchCenterEcho(
  store: CereviStore,
  getEngine: () => ViewerEngine | null | undefined,
  afterSync?: () => void,
): WatchStopHandle {
  return watch(
    () => store.centerPosition.join(':'),
    () => {
      const engine = getEngine()
      if (engine && vec3Differ(engine.target, store.centerPosition)) {
        engine.setTarget(store.centerPosition)
      }
      afterSync?.()
    },
  )
}

// ============================================================================
// EFFECTIVE-RESOLUTION READOUT
// ============================================================================

/** Renderer-reported units-per-pixel for a layer, when available. */
export function viewUnitsPerPixel(
  engine: ViewerEngine | null | undefined,
  viewName: string,
  layerId: string,
): number | undefined {
  return engine?.view(viewName).getResolution(layerId)?.unitsPerPixel
}

/** Camera-distance fallback for volume views. */
export function volumeCameraResolution(state: State, canvas: HTMLCanvasElement | null | undefined): number {
  const height = canvas?.clientHeight ?? 0
  return height > 0 ? volumeUnitsPerPixel(state.exploration.camera, height) : 0
}

/** Camera-distance fallback for orthographic slice views. */
export function sliceCameraResolution(state: State, canvas: HTMLCanvasElement | null | undefined): number {
  const height = canvas?.clientHeight ?? 0
  return height > 0 ? cameraDistance(state.exploration.camera) / height : 0
}

/** Prefer the renderer-reported resolution; fall back to the camera estimate. */
export function formatResolutionReadout(
  viewResolution: number | null | undefined,
  cameraResolution: number,
  unit: string,
): string {
  const resolution = viewResolution && viewResolution > 0 ? viewResolution : cameraResolution
  return resolution > 0 ? `${resolution.toFixed(2)} ${unit}/px` : '—'
}

// ============================================================================
// OVERLAY-OPTION SYNCHRONIZATION
// ============================================================================

/**
 * Declarative per-view overlay spec. Omitted overlays are left untouched.
 * - crosshair: standard rule (tool enabled && cursor present).
 * - ruler: extra gating ANDed with the ruler tool toggle (e.g. main view only).
 * - rois: `enabled` gates editing; passing `plane` makes the selector
 *   interactive (wires the change callbacks and the selector-active visibility).
 * - magnifier: gating flag for the active/hovered view.
 */
export interface OverlayViewSpec {
  view: string
  crosshair?: boolean
  ruler?: boolean
  rois?: { enabled: boolean; plane?: SlicePlane }
  magnifier?: boolean
  magnifierPlane?: SlicePlane
}

/** Push store tool/selection/cursor state into the galavi overlay options. */
export function syncViewOverlays(
  engine: ViewerEngine,
  store: CereviStore,
  unit: string,
  specs: OverlayViewSpec[],
): void {
  const cursor = store.cursorPosition
  const selectorActive = store.isToolEnabled('selector')
  for (const spec of specs) {
    const view = engine.view(spec.view)
    if (spec.crosshair) {
      view.setOverlayOptions('crosshair', {
        visible: store.isToolEnabled('crosshair') && Boolean(cursor),
        ...(cursor ? { position: cursor } : {}),
      })
    }
    if (spec.ruler !== undefined) {
      view.setOverlayOptions('ruler', {
        visible: spec.ruler && store.isToolEnabled('ruler'),
        unit,
        resetNonce: store.rulerResetNonce,
      })
    }
    if (spec.rois) {
      const interactive = spec.rois.plane !== undefined
      const plane = spec.rois.plane
      view.setOverlayOptions('roiselector', {
        visible: interactive ? selectorActive || store.selections.length > 0 : store.selections.length > 0,
        enabled: spec.rois.enabled,
        rois: store.selections,
        activeIndex: store.activeSelectionIndex,
        ...(interactive
          ? {
              onRoisChange: (rois: RoiBox[], change: RoiSelectionChange) => store.setSelections(rois, change, plane),
              onActiveIndexChange: (index: number | null) => store.setActiveSelectionIndex(index),
            }
          : {}),
      })
    }
    if (spec.magnifier !== undefined) {
      const show2d = spec.magnifier && store.magnifierMode === '2d' && Boolean(cursor)
      view.setOverlayOptions('magnifier-2d', {
        visible: show2d,
        position: show2d ? cursor : null,
      })
      const show3d = Boolean(
        spec.magnifier &&
        spec.magnifierPlane &&
        store.magnifierMode === '3d' &&
        store.magnifier3dPlane === spec.magnifierPlane &&
        store.magnifier3dPosition,
      )
      view.setOverlayOptions('magnifier-3d', {
        visible: show3d,
        position: show3d ? store.magnifier3dPosition : null,
      })
    }
  }
}

// ============================================================================
// POINTER → PHYSICAL CURSOR
// ============================================================================

/** Map a pointer event on a slice canvas to physical coordinates. */
export function pointerToSlicePhysical(
  event: PointerEvent | MouseEvent,
  canvas: HTMLCanvasElement | null | undefined,
  state: State | null,
  axisMap: AxisMap,
  normalPosition: number,
): Vec3 | null {
  if (!state || !canvas) return null
  const bounds = canvas.getBoundingClientRect()
  return screenToSlicePhysical(
    event.clientX - bounds.left,
    event.clientY - bounds.top,
    state,
    axisMap,
    bounds.width,
    bounds.height,
    normalPosition,
  )
}

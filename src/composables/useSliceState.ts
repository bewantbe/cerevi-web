/**
 * useSliceState — slice-derived state, channel/contrast/slice change handlers.
 *
 * Owns: per-slice reactive index state, and the three forwarding handlers
 * that update imagery layers through Galavi's headless UI view.
 */

import { ref, reactive } from "vue";
import type { Galavi, Vec2, Vec3 } from "galavi";
import {
  type SetupContext,
  SLICE_DEFS,
  IMAGERY_IDS,
} from "@/galavi-setup";

// ============================================================================
// SLICE INDEX STATE
// ============================================================================

export interface SliceEntry {
  label: string;
  value: number;
  max: number;
  dataId: string;
  axisMap: Vec3;
}

function buildSlices(ctx: SetupContext): Record<string, SliceEntry> {
  const out: Record<string, SliceEntry> = {};
  for (const def of SLICE_DEFS) {
    const sliceAxis = def.axisMap[2];
    const total = Math.ceil(ctx.dataSize[sliceAxis] / ctx.mip);
    out[def.key] = {
      label: `${def.anatomicalLabel} (${def.key.toUpperCase()})`,
      value: Math.floor(total / 2),
      max: total - 1,
      dataId: def.layerId,
      axisMap: def.axisMap,
    };
  }
  return out;
}

// ============================================================================
// COMPOSABLE
// ============================================================================

export function useSliceState(getGalavi: () => Galavi | undefined, ctx: SetupContext) {
  let currentCtx = ctx;
  const channels = Array.from({ length: ctx.channelCount }, (_, i) => i);
  const channel = ref(ctx.initCh);
  const contrastBounds: Vec2 = [0, 0.06];
  const contrastStep = 0.0005;
  const contrastMin = ref(Math.max(contrastBounds[0], ctx.conRange[0]));
  const contrastMax = ref(Math.min(contrastBounds[1], ctx.conRange[1]));
  const slices = reactive(buildSlices(ctx));

  function setSetupContext(nextCtx: SetupContext) {
    currentCtx = nextCtx;

    channel.value = nextCtx.initCh;
    contrastMin.value = Math.max(contrastBounds[0], nextCtx.conRange[0]);
    contrastMax.value = Math.min(contrastBounds[1], nextCtx.conRange[1]);

    channels.length = 0;
    for (let index = 0; index < nextCtx.channelCount; index++) {
      channels.push(index);
    }

    const nextSlices = buildSlices(nextCtx);
    for (const key of Object.keys(slices)) {
      delete slices[key];
    }
    for (const [key, value] of Object.entries(nextSlices)) {
      slices[key] = value;
    }
  }

  // ------------------------------------------------------------------
  // Handlers — forward to Galavi
  // ------------------------------------------------------------------

  function onChannelChange() {
    const galavi = getGalavi();
    if (!galavi) return;
    for (const id of IMAGERY_IDS) {
      galavi.layer(id)?.setOptions({ selection: { c: channel.value } });
    }
  }

  function onContrastChange() {
    const galavi = getGalavi();
    if (!galavi) return;
    const lo = Math.max(contrastBounds[0], Math.min(contrastMin.value, contrastMax.value));
    const hi = Math.min(contrastBounds[1], Math.max(contrastMin.value, contrastMax.value));
    contrastMin.value = lo;
    contrastMax.value = hi;

    const range: Vec2 = [lo, hi];
    for (const id of IMAGERY_IDS) {
      galavi.layer(id)?.setOptions({ contrastRange: range });
    }
  }

  function onSliceChange(key: string) {
    const galavi = getGalavi();
    if (!galavi) return;

    const slice = slices[key];
    if (!slice) return;
    galavi.layer(slice.dataId)?.setOptions({ sliceIndex: slice.value });

    // Sync volume camera target to the slice's physical position
    const am = slice.axisMap;
    const physicalPos = (slice.value + 0.5) * currentCtx.mip * currentCtx.scale;
    const newTarget: Vec3 = [...galavi.getState().exploration.camera.target] as Vec3;
    newTarget[am[2]] = physicalPos;
    galavi.setTarget(newTarget);
  }

  function setSliceValue(key: string, value: number) {
    const slice = slices[key];
    if (!slice) return;
    const nextValue = Math.max(0, Math.min(slice.max, Math.round(value)));
    slice.value = nextValue;
    onSliceChange(key);
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
  };
}

/**
 * useRegionMode — region overlay + pick behavior.
 *
 * Owns: mode reactive ref, region visibility toggling, region data
 * application (URL + label updates), pick subscription wiring,
 * and keyboard shortcuts for mode switching.
 */

import { ref } from "vue";
import type { Galavi } from "galavi";
import type { LayoutState } from "./useLayout";
import {
  type ViewName,
  type SetupContext,
  SLICE_DEFS,
  REGION_DATA_IDS,
} from "@/galavi-setup";

// ============================================================================
// REGION LOOKUP (stubbed for now — wire to VISoRAPI in the future)
// ============================================================================

function lookupRegion(_coord: { x: number; y: number; z: number }): { region: string; label: string } {
  // TODO: replace with real API call to resolve brain region at coordinate
  return { region: "brain_shell", label: "Brain Shell" };
}

// ============================================================================
// COMPOSABLE
// ============================================================================

export function useRegionMode(
  getGalavi: () => Galavi | undefined,
  ctx: SetupContext,
  layout: LayoutState,
  swapToMain: (name: ViewName) => void,
) {
  const mode = ref<"basic" | "region">("basic");

  // ------------------------------------------------------------------
  // Forward helpers
  // ------------------------------------------------------------------

  function forward(type: string, payload: Record<string, unknown>) {
    getGalavi()?.view("ui").forward({ type, payload });
  }

  // ------------------------------------------------------------------
  // Apply a region to all overlay layers
  // ------------------------------------------------------------------

  function applyRegion(regionId: string, label: string) {
    forward("layer:data", { id: "regionSurface", url: `${ctx.srcPrefix}:meh3d:::${regionId}` });

    if (ctx.shapesPrefix) {
      for (const def of SLICE_DEFS) {
        forward("layer:data", { id: def.regionShapesId, urlTemplate: `${ctx.shapesPrefix}/${regionId}/{axis}/{slicePos}` });
      }
    }

    for (const id of REGION_DATA_IDS) {
      forward("layer:options", { id, regionLabel: label });
    }
  }

  // ------------------------------------------------------------------
  // Mode switching
  // ------------------------------------------------------------------

  function setRegionMode(newMode: "basic" | "region") {
    const galavi = getGalavi();
    if (!galavi || mode.value === newMode) return;
    mode.value = newMode;

    if (newMode === "basic") {
      for (const id of REGION_DATA_IDS) {
        forward("layer:render", { id, visible: false });
      }
    } else {
      if (layout.main !== "xy") swapToMain("xy" as ViewName);
      galavi.setActiveView("xy");
    }
  }

  // ------------------------------------------------------------------
  // Keyboard
  // ------------------------------------------------------------------

  function onKeyDown(e: KeyboardEvent) {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    if (e.key === "1") setRegionMode("basic");
    if (e.key === "2") setRegionMode("region");
  }

  // ------------------------------------------------------------------
  // Pick subscription (wire in onMounted)
  // ------------------------------------------------------------------

  function subscribeToPickEvents(galavi: Galavi): () => void {
    let lastPickTs = 0;

    return galavi.subscribe((state) => {
      const pickLayer = state.layers.find(l => l.id === "_pick");
      const pick = pickLayer?.options;
      if (!pick || mode.value !== "region") return;

      const ts = pick.timestamp as number;
      if (ts === lastPickTs) return;
      lastPickTs = ts;

      const { region: regionId, label } = lookupRegion({
        x: pick.x as number,
        y: pick.y as number,
        z: state.exploration.camera.target[2],
      });

      applyRegion(regionId, label);

      const anyVisible = REGION_DATA_IDS.some(
        id => state.layers.find(l => l.id === id)?.render?.visible === true,
      );
      if (!anyVisible) {
        for (const id of REGION_DATA_IDS) {
          forward("layer:render", { id, visible: true });
        }
      }
    });
  }

  return { mode, setRegionMode, applyRegion, onKeyDown, subscribeToPickEvents };
}

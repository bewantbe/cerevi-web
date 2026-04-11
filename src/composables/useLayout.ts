/**
 * useLayout — view swap and remount orchestration.
 *
 * Owns layout.main / layout.sides reactive state, swap rules
 * (navigator pinned, slice ordering), and canvas remounting.
 */

import { reactive } from "vue";
import type { Galavi } from "galavi";
import type { ViewName } from "@/galavi-setup";

export interface LayoutState {
  main: ViewName;
  sides: ViewName[];
}

export function useLayout(
  getGalavi: () => Galavi | undefined,
  canvasMain: () => HTMLCanvasElement | null,
  canvasRefs: Record<string, HTMLCanvasElement | null>,
) {
  const layout = reactive<LayoutState>({
    main: "volume" as ViewName,
    sides: ["navigator", "xy", "yz", "xz"] as ViewName[],
  });

  // ------------------------------------------------------------------
  // Swap logic
  // ------------------------------------------------------------------

  function swapToMain(viewName: ViewName) {
    const galavi = getGalavi();
    if (!galavi) return;

    const currentMain = layout.main;
    const sliceViews: ViewName[] = ["xy", "yz", "xz"];

    // Navigator stays pinned to the side bar
    if (viewName === "navigator") return;

    if (sliceViews.includes(viewName)) {
      layout.main = viewName;
      const otherSlices = (["xy", "yz", "xz"] as ViewName[]).filter(s => s !== viewName);
      layout.sides = ["navigator", "volume", ...otherSlices];
      remountAfterSwap([currentMain, viewName]);
      return;
    }

    if (viewName === "volume") {
      layout.main = "volume";
      layout.sides = ["navigator", "xy", "yz", "xz"];
      remountAfterSwap([currentMain, viewName]);
      return;
    }

    // Generic swap — keep navigator at index 0
    const sideIndex = layout.sides.indexOf(viewName);
    if (sideIndex >= 0) {
      const newSides = [...layout.sides];
      newSides[sideIndex] = currentMain;

      if (newSides[0] !== "navigator") {
        const navIdx = newSides.indexOf("navigator");
        if (navIdx >= 0) {
          [newSides[0], newSides[navIdx]] = [newSides[navIdx], newSides[0]];
        } else {
          newSides.unshift("navigator");
          newSides.pop();
        }
      }

      layout.main = viewName;
      layout.sides = newSides;
      remountAfterSwap([currentMain, viewName]);
    }
  }

  // ------------------------------------------------------------------
  // Mount helpers
  // ------------------------------------------------------------------

  async function mountViewByName(viewName: ViewName) {
    const galavi = getGalavi();
    if (!galavi || !galavi.getViewConfig(viewName)) return;

    const canvas = viewName === layout.main ? canvasMain() : canvasRefs[viewName];
    if (!canvas) return;

    await galavi.mount(viewName, canvas);
    if (viewName === layout.main) {
      galavi.setActiveView(viewName);
    }
  }

  async function remountAfterSwap(changedViews: ViewName[]) {
    const galavi = getGalavi();
    if (!galavi) return;

    for (const v of changedViews) galavi.unmount(v);
    await new Promise(r => setTimeout(r, 0));
    for (const v of changedViews) await mountViewByName(v);
  }

  // ------------------------------------------------------------------
  // Click handler (activate + swap)
  // ------------------------------------------------------------------

  function handleViewClick(viewName: ViewName) {
    const galavi = getGalavi();
    if (!galavi) return;

    const config = galavi.getViewConfig(viewName);
    if (!config) return;

    if (config.activatable !== false) {
      galavi.setActiveView(viewName);
    }
    if (config.activatable !== false && viewName !== layout.main && layout.sides.includes(viewName)) {
      swapToMain(viewName);
    }
  }

  return { layout, swapToMain, handleViewClick };
}

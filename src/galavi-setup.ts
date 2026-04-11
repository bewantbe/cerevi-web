/**
 * Galavi setup for cerevi-web.
 *
 * Adapted from the-explorer's galavi-setup.ts but parameterized
 * by Specimen metadata fetched from the VISoR API.
 *
 * Owns: dataset constants, layer factories, view config generation,
 * and the createGalavi bootstrap call.
 */

import {
  createGalavi,
  type Galavi,
  type State,
  type ViewConfig,
} from "galavi";
import { getVisorInfo, type Vec2, type Vec3 } from "@/services/visor-adapter";
import type { Specimen } from "@/types";

export type ViewName = "volume" | "navigator" | "xy" | "yz" | "xz" | "none";
export type ConfiguredViewName = Exclude<ViewName, "none">;

// ============================================================================
// SLICE AXIS DEFINITIONS
// ============================================================================

export interface SliceDef {
  key: string;
  axes: [string, string];
  axisMap: Vec3;
  urlTag: string;
  layerId: string;
  regionShapesId: string;
}

export const SLICE_DEFS: SliceDef[] = [
  { key: "xy", axes: ["x", "y"], axisMap: [0, 1, 2], urlTag: "imgxy", layerId: "sliceXY", regionShapesId: "regionShapesXY" },
  { key: "yz", axes: ["y", "z"], axisMap: [1, 2, 0], urlTag: "imgyz", layerId: "sliceYZ", regionShapesId: "regionShapesYZ" },
  { key: "xz", axes: ["x", "z"], axisMap: [0, 2, 1], urlTag: "imgxz", layerId: "sliceXZ", regionShapesId: "regionShapesXZ" },
];

export const REGION_DATA_IDS = [
  "regionSurface",
  ...SLICE_DEFS.map(s => s.regionShapesId),
];

export const IMAGERY_IDS = ["volume", ...SLICE_DEFS.map(s => s.layerId)];

// ============================================================================
// SETUP CONTEXT (built per-specimen)
// ============================================================================

export interface SetupContext {
  srcPrefix: string;
  shapesPrefix: string;
  dataSize: Vec3;
  surfaceSize: Vec3;
  scale: number;
  conRange: Vec2;
  mip: number;
  initCh: number;
  initRegion: string;
  channelCount: number;
  volumeLevelRange: Vec2;
  volumeTileSize: Vec3;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export function buildSetupContext(specimen: Specimen): SetupContext {
  const srcPrefix = `${API_BASE_URL}/data/${specimen.id}`;
  const info = specimen.imageInfo;

  // physical_size_um is [z, y, x] from the API — map to [x, y, z]
  const [z, y, x] = info.physical_size_um;
  const dataSize: Vec3 = [x, y, z];

  const voxelSize = 1; // μm/voxel at level 0
  const mip = info.tile_thickness_2d || 20;

  return {
    srcPrefix,
    shapesPrefix: import.meta.env.VITE_SHAPE_URL ?? "",
    dataSize,
    surfaceSize: [dataSize[0] / 10, dataSize[1] / 10, dataSize[2] / 10],
    scale: voxelSize,
    conRange: [0.0, 0.05],
    mip,
    initCh: 0,
    initRegion: "brain_shell",
    channelCount: info.channels?.length ?? 4,
    volumeLevelRange: [0, (info.resolutions_um_3d?.length ?? 1) - 1] as Vec2,
    volumeTileSize: info.tile_size_3d ?? [64, 64, 64],
  };
}

// ============================================================================
// LAYER FACTORIES
// ============================================================================

function makeSliceLayer(def: SliceDef, ctx: SetupContext) {
  return {
    id: def.layerId,
    type: "slice",
    data: {
      urlTemplate: `${ctx.srcPrefix}:${def.urlTag}:{level}:{c}:{z},{y},{x}`,
    },
    options: {
      axes: def.axes,
      mipThickness: ctx.mip,
      contrastRange: ctx.conRange,
      dataSize: ctx.dataSize,
      scale: ctx.scale,
      selection: { c: ctx.initCh },
      levelRange: [0, 6] as Vec2,
      tileSize: [512, 512] as Vec2,
      maxPoolSize: 512,
    },
  };
}

function makeRegionShapesLayer(def: SliceDef, ctx: SetupContext) {
  return {
    id: def.regionShapesId,
    type: "shapes",
    ...(ctx.shapesPrefix
      ? { data: { urlTemplate: `${ctx.shapesPrefix}/${ctx.initRegion}/{axis}/{slicePos}` } }
      : {}),
    options: {
      color: [0.9, 0.2, 0.2] as Vec3,
      opacity: 1.0,
      surfaceSourceId: "regionSurface",
      axes: def.axes,
      regionLabel: "Brain Shell",
    },
    render: { visible: false },
  };
}

function buildLayers(ctx: SetupContext) {
  return [
    // Volume
    {
      id: "volume",
      type: "volume",
      data: { urlTemplate: `${ctx.srcPrefix}:img3d:{level}:{c}:{z},{y},{x}` },
      options: {
        contrastRange: ctx.conRange,
        dataSize: ctx.dataSize,
        scale: ctx.scale,
        selection: { c: ctx.initCh },
        levelRange: ctx.volumeLevelRange,
        tileSize: ctx.volumeTileSize,
        maxPoolSize: 512,
      },
    },
    // Navigator surface
    {
      id: "surface",
      type: "surface",
      data: { url: `${ctx.srcPrefix}:meh3d:::brain_shell` },
      options: {
        dataSize: ctx.surfaceSize,
        material: {
          color: [0.753, 0.773, 0.808],
          wireframe: false,
          opacity: 0.8,
          doubleSided: true,
          shading: "xray",
        },
      },
    },
    // Slice layers
    ...SLICE_DEFS.map(def => makeSliceLayer(def, ctx)),
    // Region surface overlay
    {
      id: "regionSurface",
      type: "surface",
      data: { url: `${ctx.srcPrefix}:meh3d:::${ctx.initRegion}` },
      options: {
        dataSize: ctx.surfaceSize,
        material: {
          color: [0.9, 0.2, 0.2],
          wireframe: false,
          opacity: 0.6,
          doubleSided: true,
          shading: "xray",
        },
        regionLabel: "Brain Shell",
      },
      render: { visible: false },
    },
    // Region shape overlays (one per slice plane)
    ...SLICE_DEFS.map(def => makeRegionShapesLayer(def, ctx)),
  ];
}

// ============================================================================
// VIEW CONFIG FACTORY
// ============================================================================

function buildViewConfigs(): Record<ConfiguredViewName, ViewConfig> {
  const configs: Record<string, ViewConfig> = {
    volume: {
      type: "volume",
      layers: ["volume", "regionSurface"],
      controls: ["orbit", "fly"],
      gizmos: {
        scalebar: { visibleWhenActive: true, position: "top-right" },
        text: { position: "top-left", visibleWhenActive: true, regionDataIds: ["regionSurface"] },
      },
      label: "3D Volume",
      activatable: true,
    },
    navigator: {
      type: "navigator",
      layers: ["surface"],
      label: "Navigator",
      activatable: false,
    },
  };

  for (const def of SLICE_DEFS) {
    configs[def.key] = {
      type: "slice",
      layers: [def.layerId, "regionSurface", def.regionShapesId],
      controls: ["panzoom", "pick"],
      gizmos: {
        scalebar: { visibleWhenActive: true, position: "top-right" },
        text: { position: "top-left", visibleWhenActive: true, regionDataIds: [def.regionShapesId] },
      },
      label: `Slice ${def.key.toUpperCase()}`,
      activatable: true,
    };
  }

  return configs as Record<ConfiguredViewName, ViewConfig>;
}

// ============================================================================
// SESSION STATE
// ============================================================================

function buildSessionState(ctx: SetupContext): State {
  const visor = getVisorInfo(ctx.srcPrefix, {
    volumeDataSize: ctx.dataSize,
    voxelSize: [ctx.scale, ctx.scale, ctx.scale],
    volumeLevelRange: ctx.volumeLevelRange,
    volumeTileSize: ctx.volumeTileSize,
  });
  const cam = visor.exploration.camera;

  return {
    exploration: {
      camera: {
        navMode: "orbit",
        projMode: "perspective",
        position: [
          cam.target[0] + cam.distance * Math.cos(-0.4) * Math.sin(0.5),
          cam.target[1] + cam.distance * Math.sin(-0.4),
          cam.target[2] + cam.distance * Math.cos(-0.4) * Math.cos(0.5),
        ],
        target: cam.target,
      },
      lod: { mode: "auto", level: 0 },
    },
    physical: visor.physical,
    layers: buildLayers(ctx),
  };
}

// ============================================================================
// BOOTSTRAP
// ============================================================================

export const viewConfigs = buildViewConfigs();

export function isConfiguredViewName(name: ViewName): name is ConfiguredViewName {
  return name !== "none";
}

/**
 * Create the Galavi instance with all views wired to their canvases.
 */
export async function bootstrap(
  ctx: SetupContext,
  mainCanvas: HTMLCanvasElement,
  sideCanvases: Record<string, HTMLCanvasElement>,
  mainViewName: ConfiguredViewName,
  sideViewNames: ConfiguredViewName[],
): Promise<Galavi> {
  const sessionState = buildSessionState(ctx);

  const views: Record<string, ViewConfig> = {
    ...viewConfigs,
    [mainViewName]: { ...viewConfigs[mainViewName], canvas: mainCanvas },
    ...Object.fromEntries(
      sideViewNames
        .filter(name => sideCanvases[name])
        .map(name => [name, { ...viewConfigs[name], canvas: sideCanvases[name] }]),
    ),
    ui: {
      type: "headless",
      layers: [] as string[],
      controls: ["param"],
    },
  };

  return createGalavi({ state: sessionState, views });
}

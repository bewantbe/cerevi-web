/**
 * Visor -> Galavi adapter
 *
 * Provides dataset metadata for Visor-format brain volume datasets.
 * Handles multi-modal alignment: volume and surface may have different
 * voxel resolutions but share the same physical space.
 *
 * Usage:
 *   const info = getVisorInfo("https://host:8080/data/RM009");
 *   // info.physical      → shared coordinate system
 *   // info.volume         → volume-specific metadata
 *   // info.surface        → surface-specific metadata (10× downsampled)
 */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

const INITIAL_CAMERA_DISTANCE_FACTOR = 1.5;

export interface SpatialConfig {
  size: Vec3;
  unit: string;
}

export interface VisorModalityInfo {
  /** Voxel/vertex dimensions of this modality */
  dataSize: Vec3;
  /** Physical size per voxel (μm/voxel) */
  voxelSize: Vec3;
}

export interface VisorInfo {
  /** Base URL prefix for data fetching */
  srcPrefix: string;
  /** Shared physical space for all modalities */
  physical: { spatial: SpatialConfig };
  /** Volume modality metadata */
  volume: VisorModalityInfo & {
    levelRange: Vec2;
    tileSize: Vec3;
  };
  /** Surface modality metadata (e.g. 10× downsampled) */
  surface: VisorModalityInfo;
  /** Suggested initial exploration state */
  exploration: {
    camera: { target: Vec3; distance: number };
  };
}

/**
 * Build VisorInfo for a dataset.
 *
 * In the future this could fetch metadata from a server endpoint;
 * for now the modality metadata is parameterized.
 */
export function getVisorInfo(
  srcPrefix: string,
  opts?: {
    volumeDataSize?: Vec3;
    surfaceDataSize?: Vec3;
    voxelSize?: Vec3;
    surfaceVoxelSize?: Vec3;
    volumeLevelRange?: Vec2;
    volumeTileSize?: Vec3;
    units?: string;
  },
): VisorInfo {
  const volumeDataSize: Vec3 = opts?.volumeDataSize ?? [70000, 60000, 72300];
  const voxelSize: Vec3 = opts?.voxelSize ?? [1, 1, 1];
  const surfaceVoxelSize: Vec3 = opts?.surfaceVoxelSize ?? [10, 10, 10];
  const surfaceDataSize: Vec3 = opts?.surfaceDataSize ?? [
    volumeDataSize[0] * voxelSize[0] / surfaceVoxelSize[0],
    volumeDataSize[1] * voxelSize[1] / surfaceVoxelSize[1],
    volumeDataSize[2] * voxelSize[2] / surfaceVoxelSize[2],
  ];
  const units = opts?.units ?? "μm";

  const physicalSize: Vec3 = [
    volumeDataSize[0] * voxelSize[0],
    volumeDataSize[1] * voxelSize[1],
    volumeDataSize[2] * voxelSize[2],
  ];
  const maxExtent = Math.max(...physicalSize);
  const center: Vec3 = [physicalSize[0] / 2, physicalSize[1] / 2, physicalSize[2] / 2];

  return {
    srcPrefix,
    physical: { spatial: { size: physicalSize, unit: units } },
    volume: {
      dataSize: volumeDataSize,
      voxelSize,
      levelRange: opts?.volumeLevelRange ?? [0, 9],
      tileSize: opts?.volumeTileSize ?? [64, 64, 64],
    },
    surface: {
      dataSize: surfaceDataSize,
      voxelSize: surfaceVoxelSize,
    },
    exploration: { camera: { target: center, distance: maxExtent * INITIAL_CAMERA_DISTANCE_FACTOR } },
  };
}

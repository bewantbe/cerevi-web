// Specimen types — OME-Zarr backed via cerevi-server's gateway.

export interface ChannelMetadata {
  wavelength: string
  marker: string
}

export type DataMode = '3d' | 'xy' | 'xz' | 'yz'
export type ModeEntry = [fileIndex: number, levels: number[], entries: (number | string)[]]

export interface ImageMetadata {
  description?: string
  RAS_coordinate?: string
  files?: string[]
  modes?: Partial<Record<DataMode, ModeEntry[]>>
  pixel_format?: string
  physical_size_um?: [number, number, number]
  origin_um?: [number, number, number]
  channels?: ChannelMetadata[]
  resolutions_um_2d?: [number, number][]
  axes_order?: string
  tile_size_2d?: [number, number]
  tile_step_2d?: number
  tile_thickness_2d?: number
  tile_size_3d?: [number, number, number]
}

export interface MeshMetadata {
  description?: string
  RAS_coordinate?: string
  downsample_factor?: number
  files?: string[]
  modes?: Partial<Record<DataMode, ModeEntry[]>>
}

/** A specimen entry returned by GET /registry/specimens. */
export interface Specimen {
  id: string
  kind?: 'specimen' | 'atlas'
  name: string
  species?: string
  description?: string
  /** ID of the atlas this specimen references (if any). Specimens only. */
  atlasReference?: string | null
  /** Variant names available under each kind. Specimens only. */
  imageVariants?: string[]
  /** Per-image-variant metadata copied from specimens.json. Specimens only. */
  imageMetadata?: Record<string, ImageMetadata>
  /** Raw variants from specimens.json. */
  image?: Record<string, ImageMetadata>
  regionMaskVariants?: string[]
  meshVariants?: string[]
  meshRegions?: Record<string, string[]>
  meshDownsampleFactors?: Record<string, number>
  /** Raw mesh variants from specimens.json. */
  mesh?: Record<string, MeshMetadata>
}

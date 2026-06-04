// Specimen types — OME-Zarr backed via cerevi-server's gateway.

export interface ChannelMetadata {
  wavelength: string
  marker: string
}

export interface ImageMetadata {
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
  encodings_2d?: string[]
  encodings_3d?: string[]
}

/** A specimen entry returned by GET /registry/specimens. */
export interface Specimen {
  id: string
  kind: 'specimen' | 'atlas'
  name: string
  species?: string
  description?: string
  /** ID of the atlas this specimen references (if any). Specimens only. */
  atlasReference?: string | null
  /** Variant names available under each kind. Specimens only. */
  imageVariants?: string[]
  /** Per-image-variant metadata copied from specimens.json. Specimens only. */
  imageMetadata?: Record<string, ImageMetadata>
  regionMaskVariants?: string[]
  meshVariants?: string[]
  meshRegions?: Record<string, string[]>
  meshDownsampleFactors?: Record<string, number>
}

// Specimen types — OME-Zarr backed via cerevi-server's facade.

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
  regionMaskVariants?: string[]
  meshVariants?: string[]
}

// Specimen and metadata types

export interface Specimen {
  id: string
  name: string
  species: string
  description: string
  image: Object
  region_mask: Object
  mesh: Object
  atlas_reference: Object
  imageInfo: ImageInfo
}

export interface Channel {
  wavelength: string
  marker: string
}

export interface ImageInfo {
  description: string
  data_provider: Object
  pixel_format: string
  physical_size_um: number[]
  origin_um: number[]
  channels: Channel[]
  resolutions_um_2d: number[]
  resolutions_um_3d: number[]
  axes_order: string
  RAS_coordinate: string
  tile_size_2d: [number, number]
  tile_step_2d: number
  tile_thickness_2d: number
  tile_size_3d: [number, number, number]
  encodings_2d: string[]
  encodings_3d: string[]
}

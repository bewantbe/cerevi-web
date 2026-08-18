/**
 * Galavi setup for cerevi-web — OME-Zarr backed.
 *
 * Opens the specimen's volume OME-Zarr group as one ImageDataset via
 * galavi/ome-zarr and renders three slice views from separate precomputed
 * projection sources. Surface and region overlays are loaded from
 * cerevi-server's mesh endpoint when available.
 *
 * This module is a barrel over the focused src/galavi/* modules; it keeps the
 * historical `@/galavi-setup` import path (and its test mocks) working.
 */

export * from './galavi/context'
export * from './galavi/slice-geometry'
export * from './galavi/layer-factories'
export * from './galavi/view-factories'
export * from './galavi/standalone-builders'

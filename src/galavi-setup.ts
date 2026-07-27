/**
 * Galavi setup for cerevi-web — OME-Zarr backed.
 *
 * Loads the specimen's volume OME-Zarr v0.5 group via @galavi/ome-zarr-adapter
 * and synthesizes three slice views from the same volume (no separate projn
 * zarrs). Surface and region overlays are loaded from cerevi-server's mesh
 * endpoint when available.
 *
 * This module is a barrel over the focused src/galavi/* modules; it keeps the
 * historical `@/galavi-setup` import path (and its test mocks) working.
 */

export * from './galavi/context'
export * from './galavi/slice-geometry'
export * from './galavi/layer-factories'
export * from './galavi/view-factories'
export * from './galavi/standalone-builders'

/**
 * cerevi-server API client.
 *
 * Server endpoints (see cerevi-server/backend/app/api/{registry_routes,zarr_facade}.py):
 *   GET /registry/specimens                              -> Specimen[]
 *   GET /registry/specimens/{id}                         -> Specimen
 *   GET /specimens/{id}/atlas                            -> { id, regionsUrl, ... }
 *   GET /atlas/{atlas_id}/regions.json                   -> regions JSON
 *   GET /meshes/{specimen}/{variant}/{region}.obj        -> OBJ
 *   GET /ome-zarr/{specimen}/{kind}/{variant}/{mode}/... -> OME-Zarr v0.5
 */

import axios from 'axios'
import type { Specimen } from '@/types'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export type ImageMode = '3d' | 'xy' | 'xz' | 'yz'
export type DatasetKind = 'image' | 'region_mask'

export interface AtlasResolution {
  id: string
  name?: string
  description?: string
  regionsUrl: string
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  },
)

export class VISoRAPI {
  static async getSpecimens(): Promise<Specimen[]> {
    const { data } = await api.get<Specimen[]>('/registry/specimens')
    return data
  }

  static async getSpecimen(id: string): Promise<Specimen> {
    const { data } = await api.get<Specimen>(`/registry/specimens/${id}`)
    return data
  }

  /** Returns the atlas referenced by a specimen (404 if none). */
  static async getAtlas(specimenId: string): Promise<AtlasResolution> {
    const { data } = await api.get<AtlasResolution>(`/specimens/${specimenId}/atlas`)
    return { ...data, regionsUrl: absolutize(data.regionsUrl) }
  }

  /** Build an absolute URL to an OME-Zarr group served by the facade. */
  static omeZarrUrl(
    specimenId: string,
    kind: DatasetKind,
    variant: string,
    mode: ImageMode,
  ): string {
    return `${API_BASE_URL}/ome-zarr/${specimenId}/${kind}/${variant}/${mode}`
  }

  static getMeshUrl(specimenId: string, variant: string, region: string): string {
    return `${API_BASE_URL}/meshes/${specimenId}/${variant}/${region}.obj`
  }

  static async healthCheck(): Promise<{ status: string }> {
    const { data } = await api.get('/health')
    return data
  }
}

function absolutize(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return `${API_BASE_URL}${path.startsWith('/') ? path : '/' + path}`
}

export default VISoRAPI


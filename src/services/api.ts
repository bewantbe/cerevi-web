/**
 * Cerevi data API client.
 *
 * Endpoints (see cerevi-manager/nginx.conf for routing):
 *   GET /data/specimens.json    -> Specimen[]
 *   GET /data/{path}            -> See cerevi-server/metadata/specimens.json for actual data path
 */

import axios from "axios"
import type { Specimen } from "@/types"

const API_BASE_URL = normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL || "")

export type ImageMode = "3d" | "xy" | "xz" | "yz"
export type DatasetKind = "image" | "region_mask"

export interface AtlasResolution {
  id: string
  name?: string
  description?: string
  regionsUrl: string
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error("API Error:", error.response?.data || error.message)
    return Promise.reject(error)
  },
)

export class VISoRAPI {
  static async getSpecimens(): Promise<Specimen[]> {
    const { data } = await api.get<Specimen[] | Record<string, Specimen>>("/data/specimens.json");
    // The backing specimens.json is an object keyed by specimen ID, but the
    // rest of the app expects an array. Normalize both shapes defensively.
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object") return Object.values(data);
    return [];
  }

  static dataUrl(path: string): string {
    return absoluteApiUrl(`/data/${path}`);
  }

  static async healthCheck(): Promise<{ status: string }> {
    const { data } = await api.get("/health");
    return data;
  }
}

function absolutize(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return absoluteApiUrl(path)
}

function absoluteApiUrl(path: string): string {
  const apiPath = `${API_BASE_URL}${path.startsWith("/") ? path : "/" + path}`
  if (/^https?:\/\//.test(apiPath)) return apiPath
  if (typeof window === "undefined") return apiPath
  return new URL(apiPath, window.location.origin).toString()
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "")
}

export default VISoRAPI


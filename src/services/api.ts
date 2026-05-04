import axios from 'axios'
import type { Specimen, ImageInfo } from '@/types'

// API configuration
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// API methods
export class VISoRAPI {
  // Specimens
  static async getSpecimens(): Promise<Specimen[]> {
    const response = await api.get('/metadata', {
      params: { type: 'specimens' },
    })
    const specimenMetaList = Object.values(response.data).filter((meta: any) => {
      return 'image' in meta
    })
    const specimens = specimenMetaList.map((specimenMeta: any) => {
      // Parse image
      const { image, ...rest } = specimenMeta
      const imageInfo = Object.values(image)[0] as ImageInfo
      // Create the specimen object
      const specimen: Specimen = {
        ...rest,
        image: image, // Keep the original image object
        imageInfo: imageInfo,
      }

      return specimen
    })

    return specimens
  }

  // Health check
  static async healthCheck(): Promise<{ status: string; version: string }> {
    const response = await api.get('/health')
    return response.data
  }
}

// Error handling interceptor
api.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message)
    return Promise.reject(error)
  }
)

export default VISoRAPI

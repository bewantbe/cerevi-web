import { ref } from 'vue'
import { defineStore } from 'pinia'
import type { OMEZarrInfo } from '@galavi/ome-zarr-adapter'
import VISoRAPI from '@/services/api'
import type { Specimen } from '@/types'

export const useVISoRStore = defineStore('visor', () => {
  const currentSpecimen = ref<Specimen | null>(null)
  const specimens = ref<Record<string, any>>({})
  const loading = ref(false)
  const error = ref<string | null>(null)
  const explorerPositionReadout = ref('—')
  const explorerResolutionReadout = ref('—')
  const volumeInfo = ref<OMEZarrInfo | null>(null)
  let specimensRequest: Promise<void> | null = null

  async function loadSpecimens() {
    if (specimensRequest) return specimensRequest

    loading.value = true
    error.value = null

    specimensRequest = (async () => {
      try {
        specimens.value = await VISoRAPI.getSpecimens()
      } catch (err) {
        error.value = 'Failed to load specimens'
        console.error(err)
      } finally {
        loading.value = false
        specimensRequest = null
      }
    })()

    return specimensRequest
  }

  function setCurrentSpecimen(specimenId: string) {
    const specimen = specimens.value[specimenId] ?? null
    currentSpecimen.value = specimen
    error.value = specimen ? null : 'Specimen not found'
  }

  function clearError() {
    error.value = null
  }

  function setExplorerReadouts(position: string, resolution: string) {
    explorerPositionReadout.value = position
    explorerResolutionReadout.value = resolution
  }

  function clearExplorerReadouts() {
    explorerPositionReadout.value = '—'
    explorerResolutionReadout.value = '—'
  }

  function setVolumeInfo(info: OMEZarrInfo) {
    volumeInfo.value = info
  }

  function clearVolumeInfo() {
    volumeInfo.value = null
  }

  function initialize() {
    loadSpecimens()
  }

  return {
    currentSpecimen,
    specimens,
    loading,
    error,
    explorerPositionReadout,
    explorerResolutionReadout,
    volumeInfo,
    loadSpecimens,
    setCurrentSpecimen,
    clearError,
    setExplorerReadouts,
    clearExplorerReadouts,
    setVolumeInfo,
    clearVolumeInfo,
    initialize,
  }
})

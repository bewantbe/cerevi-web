import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import VISoRAPI from '@/services/api'
import type { Specimen, Region } from '@/types'

export const useVISoRStore = defineStore('visor', () => {
  // State
  const currentSpecimen = ref<Specimen | null>(null)
  const specimens = ref<Specimen[]>([])
  const selectedRegion = ref<Region | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const availableChannels = computed(() => {
    return (
      currentSpecimen.value?.imageInfo.channels || [
        { wavelength: "405", name: "DAPI" },
        { wavelength: "488", name: "AAV-eGFP" },
        { wavelength: "561", name: "AAV-mCherry" },
        { wavelength: "640", name: "Autofluorescence" },
      ]
    );
  })

  // Actions
  async function loadSpecimens() {
    loading.value = true
    error.value = null
    try {
      specimens.value = await VISoRAPI.getSpecimens()
    } catch (err) {
      error.value = 'Failed to load specimens'
      console.error(err)
    } finally {
      loading.value = false
    }
  }

  async function setCurrentSpecimen(specimenId: string) {
    loading.value = true
    error.value = null
    try {
      const specimen = specimens.value.find(s => s.id === specimenId)
      if (!specimen) {
        throw new Error('Specimen not found')
      }
      currentSpecimen.value = specimen
    } catch (err) {
      error.value = 'Failed to load specimen'
      console.error(err)
    } finally {
      loading.value = false
    }
  }

  function setSelectedRegion(region: Region | null) {
    selectedRegion.value = region
  }

  function clearError() {
    error.value = null
  }

  function initialize() {
    loadSpecimens()
  }

  return {
    currentSpecimen,
    specimens,
    selectedRegion,
    loading,
    error,
    availableChannels,
    loadSpecimens,
    setCurrentSpecimen,
    setSelectedRegion,
    clearError,
    initialize,
  }
})

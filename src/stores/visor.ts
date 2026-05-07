import { ref } from 'vue'
import { defineStore } from 'pinia'
import VISoRAPI from '@/services/api'
import type { Specimen } from '@/types'

export const useVISoRStore = defineStore('visor', () => {
  const currentSpecimen = ref<Specimen | null>(null)
  const specimens = ref<Specimen[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

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

  function setCurrentSpecimen(specimenId: string) {
    const specimen = specimens.value.find((s) => s.id === specimenId) ?? null
    currentSpecimen.value = specimen
    if (!specimen) error.value = 'Specimen not found'
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
    loading,
    error,
    loadSpecimens,
    setCurrentSpecimen,
    clearError,
    initialize,
  }
})

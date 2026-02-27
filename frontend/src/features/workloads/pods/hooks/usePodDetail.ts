import { useEffect, useRef, useState } from 'react'
import { GetPodDetails } from '../../../../shared/api'
import { toPodDetail } from '../../../../shared/utils/normalization'
import type { PodDetail, PodResource } from '../../../../shared/types'

interface UsePodDetailResult {
  podDetail: PodDetail | null
  podDetailLoading: boolean
  podDetailError: string | null
}

export function usePodDetail(clusterFilename: string, selectedPod: PodResource | null): UsePodDetailResult {
  const [podDetail, setPodDetail] = useState<PodDetail | null>(null)
  const [podDetailLoading, setPodDetailLoading] = useState(false)
  const [podDetailError, setPodDetailError] = useState<string | null>(null)
  const podDetailsRequestRef = useRef(0)

  useEffect(() => {
    if (!selectedPod) {
      setPodDetail(null)
      setPodDetailLoading(false)
      setPodDetailError(null)
      return
    }

    let active = true
    const requestId = podDetailsRequestRef.current + 1
    podDetailsRequestRef.current = requestId

    const loadDetails = async () => {
      setPodDetailLoading(true)
      try {
        const response = await GetPodDetails(clusterFilename, selectedPod.namespace, selectedPod.name)
        if (!active || podDetailsRequestRef.current !== requestId) {
          return
        }
        setPodDetail(toPodDetail(response))
        setPodDetailError(null)
      } catch (errorValue: unknown) {
        if (!active || podDetailsRequestRef.current !== requestId) {
          return
        }
        setPodDetail(null)
        setPodDetailError(errorValue instanceof Error ? errorValue.message : String(errorValue))
      } finally {
        if (!active || podDetailsRequestRef.current !== requestId) {
          return
        }
        setPodDetailLoading(false)
      }
    }

    void loadDetails()
    const refresh = window.setInterval(() => {
      void loadDetails()
    }, 5000)

    return () => {
      active = false
      window.clearInterval(refresh)
    }
  }, [clusterFilename, selectedPod])

  return { podDetail, podDetailLoading, podDetailError }
}

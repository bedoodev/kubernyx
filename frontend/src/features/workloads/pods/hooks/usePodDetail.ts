import { useMemo } from 'react'
import { GetPodDetails } from '../../../../shared/api'
import { toPodDetail } from '../../../../shared/utils/normalization'
import type { PodDetail, PodResource } from '../../../../shared/types'
import { usePollingFetch } from '../../shared/usePollingFetch'

interface UsePodDetailResult {
  podDetail: PodDetail | null
  podDetailLoading: boolean
  podDetailError: string | null
}

export function usePodDetail(clusterFilename: string, selectedPod: PodResource | null): UsePodDetailResult {
  const fetcher = useMemo(() => {
    if (!selectedPod) return null
    return async () => {
      const response = await GetPodDetails(clusterFilename, selectedPod.namespace, selectedPod.name)
      return toPodDetail(response)
    }
  }, [clusterFilename, selectedPod])

  const { data: podDetail, loading: podDetailLoading, error: podDetailError } = usePollingFetch(
    fetcher,
    null as PodDetail | null,
    5000,
    [fetcher],
  )

  return { podDetail, podDetailLoading, podDetailError }
}

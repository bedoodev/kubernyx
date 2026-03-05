import { useMemo } from 'react'
import { GetWorkloadDetails } from '../../../shared/api'
import { toConfigDetail } from '../../../shared/utils/normalization'
import type { ConfigDetail, ConfigResource } from '../../../shared/types'
import { toConfigAPIKind, type ImplementedConfigTabId } from '../configKinds'
import { usePollingFetch } from '../../workloads/shared/usePollingFetch'

interface UseConfigDetailResult {
  configDetail: ConfigDetail | null
  configDetailLoading: boolean
  configDetailError: string | null
}

export function useConfigDetail(
  clusterFilename: string,
  selectedResource: ConfigResource | null,
  configTab: ImplementedConfigTabId,
): UseConfigDetailResult {
  const fetcher = useMemo(() => {
    if (!selectedResource) {
      return null
    }
    return async () => {
      const response = await GetWorkloadDetails(
        clusterFilename,
        toConfigAPIKind(configTab),
        selectedResource.namespace,
        selectedResource.name,
      )
      return toConfigDetail(response)
    }
  }, [clusterFilename, configTab, selectedResource])

  const { data: configDetail, loading: configDetailLoading, error: configDetailError } = usePollingFetch(
    fetcher,
    null as ConfigDetail | null,
    5000,
    [fetcher],
  )

  return { configDetail, configDetailLoading, configDetailError }
}

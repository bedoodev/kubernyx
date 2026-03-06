import { useMemo } from 'react'
import { GetWorkloadDetails } from '../../../shared/api'
import { toDeploymentDetail } from '../../../shared/utils/normalization'
import type { DeploymentDetail, DeploymentResource, NetworkTabId } from '../../../shared/types'
import { toNetworkAPIKind } from '../networkKinds'
import { usePollingFetch } from '../../workloads/shared/usePollingFetch'

interface UseNetworkDetailResult {
  networkDetail: DeploymentDetail | null
  networkDetailLoading: boolean
  networkDetailError: string | null
}

export function useNetworkDetail(
  clusterFilename: string,
  selectedResource: DeploymentResource | null,
  networkTab: NetworkTabId,
): UseNetworkDetailResult {
  const fetcher = useMemo(() => {
    if (!selectedResource) {
      return null
    }
    return async () => {
      const response = await GetWorkloadDetails(
        clusterFilename,
        toNetworkAPIKind(networkTab),
        selectedResource.namespace,
        selectedResource.name,
      )
      return toDeploymentDetail(response)
    }
  }, [clusterFilename, networkTab, selectedResource])

  const { data: networkDetail, loading: networkDetailLoading, error: networkDetailError } = usePollingFetch(
    fetcher,
    null as DeploymentDetail | null,
    5000,
    [fetcher],
  )

  return { networkDetail, networkDetailLoading, networkDetailError }
}

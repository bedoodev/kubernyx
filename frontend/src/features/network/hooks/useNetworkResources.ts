import { useMemo } from 'react'
import { GetWorkloadResources } from '../../../shared/api'
import { toDeploymentResources } from '../../../shared/utils/normalization'
import type { DeploymentResource, NetworkTabId } from '../../../shared/types'
import { toNetworkAPIKind } from '../networkKinds'
import { usePollingFetch } from '../../workloads/shared/usePollingFetch'

interface UseNetworkResourcesResult {
  items: DeploymentResource[]
  loading: boolean
  error: string | null
}

const EMPTY: DeploymentResource[] = []

export function useNetworkResources(
  clusterFilename: string,
  selectedNamespaces: string[],
  networkTab: NetworkTabId,
): UseNetworkResourcesResult {
  const namespacesKey = selectedNamespaces.join('\u0000')

  const fetcher = useMemo(() => {
    if (selectedNamespaces.length === 0) {
      return null
    }
    return async () => {
      const response = await GetWorkloadResources(clusterFilename, toNetworkAPIKind(networkTab), selectedNamespaces)
      return toDeploymentResources(response)
    }
  }, [clusterFilename, networkTab, namespacesKey])

  const { data: items, loading, error } = usePollingFetch(fetcher, EMPTY, 3000, [fetcher])
  return { items, loading, error }
}

import { useMemo } from 'react'
import { GetDeploymentResources, GetWorkloadResources } from '../../../../shared/api'
import { toDeploymentResources } from '../../../../shared/utils/normalization'
import type { DeploymentResource } from '../../../../shared/types'
import type { NonPodWorkloadTabId } from '../../workloadKinds'
import { toWorkloadAPIKind } from '../../workloadKinds'
import { usePollingFetch } from '../../shared/usePollingFetch'

interface UseDeploymentsResult {
  items: DeploymentResource[]
  loading: boolean
  error: string | null
}

const EMPTY: DeploymentResource[] = []

export function useDeployments(
  clusterFilename: string,
  selectedNamespaces: string[],
  workloadTab: NonPodWorkloadTabId = 'deployments',
): UseDeploymentsResult {
  const namespacesKey = selectedNamespaces.join('\u0000')

  const fetcher = useMemo(() => {
    if (selectedNamespaces.length === 0) return null
    return async () => {
      const response = workloadTab === 'deployments'
        ? await GetDeploymentResources(clusterFilename, selectedNamespaces)
        : await GetWorkloadResources(clusterFilename, toWorkloadAPIKind(workloadTab), selectedNamespaces)
      return toDeploymentResources(response)
    }
  }, [clusterFilename, namespacesKey, workloadTab])

  const { data: items, loading, error } = usePollingFetch(
    fetcher,
    EMPTY,
    2000,
    [fetcher],
  )

  return { items, loading, error }
}

import { useMemo } from 'react'
import { GetDeploymentDetails, GetWorkloadDetails } from '../../../../shared/api'
import { toDeploymentDetail } from '../../../../shared/utils/normalization'
import type { DeploymentDetail, DeploymentResource } from '../../../../shared/types'
import type { NonPodWorkloadTabId } from '../../workloadKinds'
import { toWorkloadAPIKind } from '../../workloadKinds'
import { usePollingFetch } from '../../shared/usePollingFetch'

interface UseDeploymentDetailResult {
  deploymentDetail: DeploymentDetail | null
  deploymentDetailLoading: boolean
  deploymentDetailError: string | null
}

export function useDeploymentDetail(
  clusterFilename: string,
  selectedDeployment: DeploymentResource | null,
  workloadTab: NonPodWorkloadTabId = 'deployments',
): UseDeploymentDetailResult {
  const fetcher = useMemo(() => {
    if (!selectedDeployment) return null
    return async () => {
      const response = workloadTab === 'deployments'
        ? await GetDeploymentDetails(
          clusterFilename,
          selectedDeployment.namespace,
          selectedDeployment.name,
        )
        : await GetWorkloadDetails(
          clusterFilename,
          toWorkloadAPIKind(workloadTab),
          selectedDeployment.namespace,
          selectedDeployment.name,
        )
      return toDeploymentDetail(response)
    }
  }, [clusterFilename, selectedDeployment, workloadTab])

  const { data: deploymentDetail, loading: deploymentDetailLoading, error: deploymentDetailError } = usePollingFetch(
    fetcher,
    null as DeploymentDetail | null,
    5000,
    [fetcher],
  )

  return { deploymentDetail, deploymentDetailLoading, deploymentDetailError }
}

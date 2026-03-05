import { useMemo } from 'react'
import { GetDeploymentLogs, GetWorkloadLogs } from '../../../../shared/api'
import { toDeploymentLogLines } from '../../../../shared/utils/normalization'
import type { DeploymentLogLine, DeploymentResource } from '../../../../shared/types'
import type { NonPodWorkloadTabId } from '../../workloadKinds'
import { toWorkloadAPIKind } from '../../workloadKinds'
import { usePollingFetch } from '../../shared/usePollingFetch'

interface UseDeploymentLogsResult {
  deploymentLogs: DeploymentLogLine[]
  deploymentLogsLoading: boolean
  deploymentLogsError: string | null
}

const DEFAULT_TAIL_LINES = 1000
const EMPTY: DeploymentLogLine[] = []

export function useDeploymentLogs(
  clusterFilename: string,
  selectedDeployment: DeploymentResource | null,
  enabled: boolean,
  workloadTab: NonPodWorkloadTabId = 'deployments',
): UseDeploymentLogsResult {
  const namespace = selectedDeployment?.namespace ?? ''
  const deploymentName = selectedDeployment?.name ?? ''

  const fetcher = useMemo(() => {
    if (!enabled || !namespace || !deploymentName) return null
    return async () => {
      const response = workloadTab === 'deployments'
        ? await GetDeploymentLogs(clusterFilename, namespace, deploymentName, DEFAULT_TAIL_LINES)
        : await GetWorkloadLogs(
          clusterFilename,
          toWorkloadAPIKind(workloadTab),
          namespace,
          deploymentName,
          DEFAULT_TAIL_LINES,
        )
      return toDeploymentLogLines(response)
    }
  }, [clusterFilename, namespace, deploymentName, enabled, workloadTab])

  const { data: deploymentLogs, loading: deploymentLogsLoading, error: deploymentLogsError } = usePollingFetch(
    fetcher,
    EMPTY,
    3000,
    [fetcher],
  )

  return { deploymentLogs, deploymentLogsLoading, deploymentLogsError }
}

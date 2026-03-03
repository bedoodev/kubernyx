import { useEffect, useState } from 'react'
import { GetDeploymentLogs, GetWorkloadLogs } from '../../../../shared/api'
import { toDeploymentLogLines } from '../../../../shared/utils/normalization'
import type { DeploymentLogLine, DeploymentResource } from '../../../../shared/types'
import type { NonPodWorkloadTabId } from '../../workloadKinds'
import { toWorkloadAPIKind } from '../../workloadKinds'

interface UseDeploymentLogsResult {
  deploymentLogs: DeploymentLogLine[]
  deploymentLogsLoading: boolean
  deploymentLogsError: string | null
}

const DEFAULT_TAIL_LINES = 1000

export function useDeploymentLogs(
  clusterFilename: string,
  selectedDeployment: DeploymentResource | null,
  enabled: boolean,
  workloadTab: NonPodWorkloadTabId = 'deployments',
): UseDeploymentLogsResult {
  const [deploymentLogs, setDeploymentLogs] = useState<DeploymentLogLine[]>([])
  const [deploymentLogsLoading, setDeploymentLogsLoading] = useState(false)
  const [deploymentLogsError, setDeploymentLogsError] = useState<string | null>(null)

  const namespace = selectedDeployment?.namespace ?? ''
  const deploymentName = selectedDeployment?.name ?? ''

  useEffect(() => {
    if (!enabled || !namespace || !deploymentName) {
      setDeploymentLogs([])
      setDeploymentLogsLoading(false)
      setDeploymentLogsError(null)
      return
    }

    let active = true

    const load = async (initial: boolean) => {
      if (initial) {
        setDeploymentLogsLoading(true)
      }
      try {
        const response = workloadTab === 'deployments'
          ? await GetDeploymentLogs(clusterFilename, namespace, deploymentName, DEFAULT_TAIL_LINES)
          : await GetWorkloadLogs(
            clusterFilename,
            toWorkloadAPIKind(workloadTab),
            namespace,
            deploymentName,
            DEFAULT_TAIL_LINES,
          )
        if (!active) {
          return
        }
        setDeploymentLogs(toDeploymentLogLines(response))
        setDeploymentLogsError(null)
      } catch (errorValue: unknown) {
        if (!active) {
          return
        }
        setDeploymentLogsError(errorValue instanceof Error ? errorValue.message : String(errorValue))
      } finally {
        if (!active) {
          return
        }
        setDeploymentLogsLoading(false)
      }
    }

    void load(true)
    const refresh = window.setInterval(() => {
      void load(false)
    }, 3000)

    return () => {
      active = false
      window.clearInterval(refresh)
    }
  }, [clusterFilename, namespace, deploymentName, enabled, workloadTab])

  return { deploymentLogs, deploymentLogsLoading, deploymentLogsError }
}

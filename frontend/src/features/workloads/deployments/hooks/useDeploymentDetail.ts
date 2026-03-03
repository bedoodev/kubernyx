import { useEffect, useRef, useState } from 'react'
import { GetDeploymentDetails, GetWorkloadDetails } from '../../../../shared/api'
import { toDeploymentDetail } from '../../../../shared/utils/normalization'
import type { DeploymentDetail, DeploymentResource } from '../../../../shared/types'
import type { NonPodWorkloadTabId } from '../../workloadKinds'
import { toWorkloadAPIKind } from '../../workloadKinds'

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
  const [deploymentDetail, setDeploymentDetail] = useState<DeploymentDetail | null>(null)
  const [deploymentDetailLoading, setDeploymentDetailLoading] = useState(false)
  const [deploymentDetailError, setDeploymentDetailError] = useState<string | null>(null)
  const requestRef = useRef(0)

  useEffect(() => {
    if (!selectedDeployment) {
      setDeploymentDetail(null)
      setDeploymentDetailLoading(false)
      setDeploymentDetailError(null)
      return
    }

    let active = true
    const requestID = requestRef.current + 1
    requestRef.current = requestID

    const load = async () => {
      setDeploymentDetailLoading(true)
      try {
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
        if (!active || requestRef.current != requestID) {
          return
        }
        setDeploymentDetail(toDeploymentDetail(response))
        setDeploymentDetailError(null)
      } catch (errorValue: unknown) {
        if (!active || requestRef.current != requestID) {
          return
        }
        setDeploymentDetail(null)
        setDeploymentDetailError(errorValue instanceof Error ? errorValue.message : String(errorValue))
      } finally {
        if (!active || requestRef.current != requestID) {
          return
        }
        setDeploymentDetailLoading(false)
      }
    }

    void load()
    const refresh = window.setInterval(() => {
      void load()
    }, 5000)

    return () => {
      active = false
      window.clearInterval(refresh)
    }
  }, [clusterFilename, selectedDeployment, workloadTab])

  return { deploymentDetail, deploymentDetailLoading, deploymentDetailError }
}

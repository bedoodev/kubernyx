import { useEffect, useState } from 'react'
import { GetDeploymentResources, GetWorkloadResources } from '../../../../shared/api'
import { toDeploymentResources } from '../../../../shared/utils/normalization'
import type { DeploymentResource } from '../../../../shared/types'
import type { NonPodWorkloadTabId } from '../../workloadKinds'
import { toWorkloadAPIKind } from '../../workloadKinds'

interface UseDeploymentsResult {
  items: DeploymentResource[]
  loading: boolean
  error: string | null
}

export function useDeployments(
  clusterFilename: string,
  selectedNamespaces: string[],
  workloadTab: NonPodWorkloadTabId = 'deployments',
): UseDeploymentsResult {
  const [items, setItems] = useState<DeploymentResource[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const namespacesKey = selectedNamespaces.join('\u0000')

  useEffect(() => {
    let active = true

    if (selectedNamespaces.length === 0) {
      setItems([])
      setError(null)
      setLoading(false)
      return () => {
        active = false
      }
    }

    const load = async (initial: boolean) => {
      if (initial) {
        setLoading(true)
      }
      try {
        const response = workloadTab === 'deployments'
          ? await GetDeploymentResources(clusterFilename, selectedNamespaces)
          : await GetWorkloadResources(clusterFilename, toWorkloadAPIKind(workloadTab), selectedNamespaces)
        if (!active) {
          return
        }
        setItems(toDeploymentResources(response))
        setError(null)
      } catch (errorValue: unknown) {
        if (!active) {
          return
        }
        setItems([])
        setError(errorValue instanceof Error ? errorValue.message : String(errorValue))
      } finally {
        if (!active) {
          return
        }
        setLoading(false)
      }
    }

    void load(true)
    const timer = window.setInterval(() => {
      void load(false)
    }, 2000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [clusterFilename, namespacesKey, workloadTab])

  return { items, loading, error }
}

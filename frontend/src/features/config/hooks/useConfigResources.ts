import { useMemo } from 'react'
import { GetWorkloadResources } from '../../../shared/api'
import { toConfigResources } from '../../../shared/utils/normalization'
import type { ConfigResource } from '../../../shared/types'
import { toConfigAPIKind, type ImplementedConfigTabId } from '../configKinds'
import { usePollingFetch } from '../../workloads/shared/usePollingFetch'

interface UseConfigResourcesResult {
  items: ConfigResource[]
  loading: boolean
  error: string | null
}

const EMPTY: ConfigResource[] = []

export function useConfigResources(
  clusterFilename: string,
  selectedNamespaces: string[],
  configTab: ImplementedConfigTabId,
): UseConfigResourcesResult {
  const namespacesKey = selectedNamespaces.join('\u0000')

  const fetcher = useMemo(() => {
    if (selectedNamespaces.length === 0) {
      return null
    }
    return async () => {
      const response = await GetWorkloadResources(clusterFilename, toConfigAPIKind(configTab), selectedNamespaces)
      return toConfigResources(response)
    }
  }, [clusterFilename, configTab, namespacesKey])

  const { data: items, loading, error } = usePollingFetch(fetcher, EMPTY, 3000, [fetcher])
  return { items, loading, error }
}

import { useMemo } from 'react'
import { GetClusterEvents } from '../../../shared/api'
import type { ClusterEvent } from '../../../shared/types'
import { usePollingFetch } from '../../workloads/shared/usePollingFetch'

interface UseClusterEventsResult {
  items: ClusterEvent[]
  loading: boolean
  error: string | null
}

const EMPTY: ClusterEvent[] = []

function toClusterEvents(data: unknown): ClusterEvent[] {
  if (!Array.isArray(data)) {
    return []
  }
  return data.map(item => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      type: String(record.type ?? ''),
      reason: String(record.reason ?? ''),
      objectKind: String(record.objectKind ?? ''),
      objectName: String(record.objectName ?? ''),
      namespace: String(record.namespace ?? ''),
      message: String(record.message ?? ''),
      count: Number(record.count ?? 0),
      age: String(record.age ?? '-'),
      createdAtUnix: Number(record.createdAtUnix ?? 0),
    }
  })
}

export function useClusterEvents(
  clusterFilename: string,
  selectedNamespaces: string[],
): UseClusterEventsResult {
  const namespacesKey = selectedNamespaces.join('\u0000')

  const fetcher = useMemo(() => {
    if (!clusterFilename || selectedNamespaces.length === 0) return null
    return async () => {
      const response = await GetClusterEvents(clusterFilename, selectedNamespaces)
      return toClusterEvents(response)
    }
  }, [clusterFilename, namespacesKey])

  const { data: items, loading, error } = usePollingFetch(fetcher, EMPTY, 5000, [fetcher])
  return { items, loading, error }
}

import { useMemo } from 'react'
import { GetNodeResources } from '../../../shared/api'
import type { NodeResource } from '../../../shared/types'
import { usePollingFetch } from '../../workloads/shared/usePollingFetch'

interface UseNodeResourcesResult {
  items: NodeResource[]
  loading: boolean
  error: string | null
}

const EMPTY: NodeResource[] = []

function toNodeResources(data: unknown): NodeResource[] {
  if (!Array.isArray(data)) {
    return []
  }
  return data.map(item => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      name: String(record.name ?? ''),
      role: String(record.role ?? ''),
      status: String(record.status ?? ''),
      version: String(record.version ?? ''),
      cpu: String(record.cpu ?? '-'),
      memory: String(record.memory ?? '-'),
      pods: String(record.pods ?? '-'),
      createdAtUnix: Number(record.createdAtUnix ?? 0),
      age: String(record.age ?? '-'),
      labels: (record.labels ?? {}) as Record<string, string>,
    }
  })
}

export function useNodeResources(clusterFilename: string): UseNodeResourcesResult {
  const fetcher = useMemo(() => {
    if (!clusterFilename) return null
    return async () => {
      const response = await GetNodeResources(clusterFilename)
      return toNodeResources(response)
    }
  }, [clusterFilename])

  const { data: items, loading, error } = usePollingFetch(fetcher, EMPTY, 5000, [fetcher])
  return { items, loading, error }
}

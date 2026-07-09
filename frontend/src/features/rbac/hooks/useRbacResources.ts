import { useMemo } from 'react'
import { GetRbacResources } from '../../../shared/api'
import type { RbacResource, RbacTabId } from '../../../shared/types'
import { usePollingFetch } from '../../workloads/shared/usePollingFetch'

interface UseRbacResourcesResult {
  items: RbacResource[]
  loading: boolean
  error: string | null
}

const EMPTY: RbacResource[] = []

function toRbacResources(data: unknown): RbacResource[] {
  if (!Array.isArray(data)) {
    return []
  }
  return data.map(item => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      kind: String(record.kind ?? ''),
      name: String(record.name ?? ''),
      namespace: String(record.namespace ?? ''),
      roleRef: String(record.roleRef ?? ''),
      subjects: String(record.subjects ?? ''),
      subjectCount: Number(record.subjectCount ?? 0),
      rules: Number(record.rules ?? 0),
      apiGroups: String(record.apiGroups ?? ''),
      resources: String(record.resources ?? ''),
      verbs: String(record.verbs ?? ''),
      age: String(record.age ?? '-'),
      createdAtUnix: Number(record.createdAtUnix ?? 0),
    }
  })
}

export function isClusterScopedRbacTab(tab: RbacTabId): boolean {
  return tab === 'cluster-roles' || tab === 'cluster-role-bindings'
}

export function useRbacResources(
  clusterFilename: string,
  activeTab: RbacTabId,
  selectedNamespaces: string[],
): UseRbacResourcesResult {
  const namespacesKey = selectedNamespaces.join('\u0000')
  const clusterScoped = isClusterScopedRbacTab(activeTab)

  const fetcher = useMemo(() => {
    if (!clusterFilename) {
      return null
    }
    if (!clusterScoped && selectedNamespaces.length === 0) {
      return null
    }
    return async () => {
      const response = await GetRbacResources(clusterFilename, activeTab, clusterScoped ? [] : selectedNamespaces)
      return toRbacResources(response)
    }
  }, [activeTab, clusterFilename, clusterScoped, namespacesKey])

  const { data: items, loading, error } = usePollingFetch(fetcher, EMPTY, 5000, [fetcher])
  return { items, loading, error }
}

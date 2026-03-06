import { useMemo } from 'react'
import { GetNodeDetail } from '../../../shared/api'
import type { NodeDetail, NodeResource } from '../../../shared/types'
import { usePollingFetch } from '../../workloads/shared/usePollingFetch'

interface UseNodeDetailResult {
  nodeDetail: NodeDetail | null
  nodeDetailLoading: boolean
  nodeDetailError: string | null
}

function toNodeDetail(data: unknown): NodeDetail {
  const record = (data ?? {}) as Record<string, unknown>
  const conditions = Array.isArray(record.conditions)
    ? record.conditions.map(item => {
      const c = (item ?? {}) as Record<string, unknown>
      return {
        type: String(c.type ?? ''),
        status: String(c.status ?? ''),
        reason: String(c.reason ?? ''),
        message: String(c.message ?? ''),
        age: String(c.age ?? '-'),
      }
    })
    : []

  const taints = Array.isArray(record.taints)
    ? record.taints.map(item => {
      const t = (item ?? {}) as Record<string, unknown>
      return {
        key: String(t.key ?? ''),
        value: String(t.value ?? ''),
        effect: String(t.effect ?? ''),
      }
    })
    : []

  const addresses = Array.isArray(record.addresses)
    ? record.addresses.map(item => {
      const a = (item ?? {}) as Record<string, unknown>
      return {
        type: String(a.type ?? ''),
        address: String(a.address ?? ''),
      }
    })
    : []

  const events = Array.isArray(record.events)
    ? record.events.map(item => {
      const e = (item ?? {}) as Record<string, unknown>
      return {
        type: String(e.type ?? '-'),
        reason: String(e.reason ?? '-'),
        message: String(e.message ?? '-'),
        count: Number(e.count ?? 0),
        age: String(e.age ?? '-'),
      }
    })
    : []

  const labelsRecord = (record.labels ?? {}) as Record<string, unknown>
  const annotationsRecord = (record.annotations ?? {}) as Record<string, unknown>

  return {
    name: String(record.name ?? ''),
    role: String(record.role ?? ''),
    status: String(record.status ?? ''),
    version: String(record.version ?? ''),
    kernelVersion: String(record.kernelVersion ?? '-'),
    os: String(record.os ?? '-'),
    architecture: String(record.architecture ?? '-'),
    containerRuntime: String(record.containerRuntime ?? '-'),
    cpu: String(record.cpu ?? '-'),
    memory: String(record.memory ?? '-'),
    pods: String(record.pods ?? '-'),
    cpuAllocatable: String(record.cpuAllocatable ?? '-'),
    memAllocatable: String(record.memAllocatable ?? '-'),
    podAllocatable: String(record.podAllocatable ?? '-'),
    age: String(record.age ?? '-'),
    created: String(record.created ?? '-'),
    uid: String(record.uid ?? '-'),
    labels: Object.fromEntries(
      Object.entries(labelsRecord).map(([key, value]) => [key, String(value ?? '')]),
    ),
    annotations: Object.fromEntries(
      Object.entries(annotationsRecord).map(([key, value]) => [key, String(value ?? '')]),
    ),
    conditions,
    taints,
    addresses,
    events,
    manifest: String(record.manifest ?? '-'),
  }
}

export function useNodeDetail(
  clusterFilename: string,
  selectedNode: NodeResource | null,
): UseNodeDetailResult {
  const fetcher = useMemo(() => {
    if (!selectedNode || !clusterFilename) return null
    return async () => {
      const response = await GetNodeDetail(clusterFilename, selectedNode.name)
      return toNodeDetail(response)
    }
  }, [clusterFilename, selectedNode])

  const { data: nodeDetail, loading: nodeDetailLoading, error: nodeDetailError } = usePollingFetch(
    fetcher,
    null as NodeDetail | null,
    5000,
    [fetcher],
  )

  return { nodeDetail, nodeDetailLoading, nodeDetailError }
}

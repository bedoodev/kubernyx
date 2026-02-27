import type {
  ClusterHealthStatus,
  WorkloadCounts,
  WorkloadPhaseCounts,
  WorkloadStatuses,
  PodsStreamEvent,
  PodResource,
  PodDetail,
} from '../types'

export function toClusterHealthStatus(value: unknown): ClusterHealthStatus {
  if (value === 'green' || value === 'yellow' || value === 'red') {
    return value
  }
  return 'red'
}

export function normalizeWorkloads(data: unknown): WorkloadCounts {
  const record = (data ?? {}) as Record<string, unknown>
  const statuses = normalizeWorkloadStatuses(record)
  return {
    pods: Number(record.pods ?? 0),
    podRunning: statuses.pods.running,
    podPending: statuses.pods.pending,
    podFailed: statuses.pods.failed,
    podSucceeded: statuses.pods.succeeded,
    deployments: Number(record.deployments ?? 0),
    replicaSets: Number(record.replicaSets ?? 0),
    statefulSets: Number(record.statefulSets ?? 0),
    daemonSets: Number(record.daemonSets ?? 0),
    jobs: Number(record.jobs ?? 0),
    cronJobs: Number(record.cronJobs ?? 0),
    statuses,
  }
}

export function normalizePhaseCounts(data: unknown): WorkloadPhaseCounts {
  const record = (data ?? {}) as Record<string, unknown>
  return {
    running: Number(record.running ?? 0),
    pending: Number(record.pending ?? 0),
    failed: Number(record.failed ?? 0),
    succeeded: Number(record.succeeded ?? 0),
  }
}

export function runningOnly(count: unknown): WorkloadPhaseCounts {
  return {
    running: Number(count ?? 0),
    pending: 0,
    failed: 0,
    succeeded: 0,
  }
}

export function normalizeWorkloadStatuses(record: Record<string, unknown>): WorkloadStatuses {
  const statusesRecord = (record.statuses ?? {}) as Record<string, unknown>
  return {
    pods: normalizePhaseCounts(statusesRecord.pods ?? {
      running: record.podRunning,
      pending: record.podPending,
      failed: record.podFailed,
      succeeded: record.podSucceeded,
    }),
    deployments: normalizePhaseCounts(statusesRecord.deployments ?? runningOnly(record.deployments)),
    replicaSets: normalizePhaseCounts(statusesRecord.replicaSets ?? runningOnly(record.replicaSets)),
    statefulSets: normalizePhaseCounts(statusesRecord.statefulSets ?? runningOnly(record.statefulSets)),
    daemonSets: normalizePhaseCounts(statusesRecord.daemonSets ?? runningOnly(record.daemonSets)),
    jobs: normalizePhaseCounts(statusesRecord.jobs ?? runningOnly(record.jobs)),
    cronJobs: normalizePhaseCounts(statusesRecord.cronJobs ?? runningOnly(record.cronJobs)),
  }
}

export function toStreamEvent(data: unknown): PodsStreamEvent {
  const record = (data ?? {}) as Record<string, unknown>
  return {
    streamId: String(record.streamId ?? ''),
    clusterFilename: String(record.clusterFilename ?? ''),
    items: Array.isArray(record.items) ? (record.items as PodResource[]) : [],
    metricsAvailable: Boolean(record.metricsAvailable),
    updatedAtUnix: Number(record.updatedAtUnix ?? 0),
    error: record.error ? String(record.error) : undefined,
  }
}

export function toPodDetail(data: unknown): PodDetail {
  const record = (data ?? {}) as Record<string, unknown>

  const labelsRecord = (record.labels ?? {}) as Record<string, unknown>
  const labels = Object.fromEntries(
    Object.entries(labelsRecord).map(([key, value]) => [key, String(value ?? '')]),
  )

  const annotationsRecord = (record.annotations ?? {}) as Record<string, unknown>
  const annotations = Object.fromEntries(
    Object.entries(annotationsRecord).map(([key, value]) => [key, String(value ?? '')]),
  )

  const ownerReferences = Array.isArray(record.ownerReferences)
    ? record.ownerReferences.map(item => {
      const owner = (item ?? {}) as Record<string, unknown>
      return {
        kind: String(owner.kind ?? ''),
        name: String(owner.name ?? ''),
        uid: String(owner.uid ?? ''),
        controller: Boolean(owner.controller),
      }
    })
    : []

  const volumes = Array.isArray(record.volumes)
    ? record.volumes.map(item => {
      const volume = (item ?? {}) as Record<string, unknown>
      return {
        name: String(volume.name ?? ''),
        type: String(volume.type ?? 'Unknown'),
        details: String(volume.details ?? '-'),
      }
    })
    : []

  const containers = Array.isArray(record.containers)
    ? record.containers.map(item => {
      const container = (item ?? {}) as Record<string, unknown>
      return {
        name: String(container.name ?? ''),
        image: String(container.image ?? '-'),
        state: String(container.state ?? 'unknown'),
        ready: Boolean(container.ready),
        restarts: Number(container.restarts ?? 0),
      }
    })
    : []

  const conditions = Array.isArray(record.conditions)
    ? record.conditions.map(item => {
      const condition = (item ?? {}) as Record<string, unknown>
      return {
        type: String(condition.type ?? ''),
        status: String(condition.status ?? ''),
        message: String(condition.message ?? '-'),
      }
    })
    : []

  return {
    name: String(record.name ?? ''),
    namespace: String(record.namespace ?? ''),
    status: String(record.status ?? ''),
    phase: String(record.phase ?? ''),
    age: String(record.age ?? '-'),
    podIP: String(record.podIP ?? '-'),
    node: String(record.node ?? '-'),
    qosClass: String(record.qosClass ?? '-'),
    restartCount: Number(record.restartCount ?? 0),
    controlledBy: String(record.controlledBy ?? '-'),
    created: String(record.created ?? '-'),
    uid: String(record.uid ?? '-'),
    resourceVersion: String(record.resourceVersion ?? '-'),
    labels,
    annotations,
    ownerReferences,
    volumes,
    containers,
    conditions,
  }
}

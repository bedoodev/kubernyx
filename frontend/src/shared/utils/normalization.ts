import type {
  ClusterHealthStatus,
  WorkloadCounts,
  WorkloadPhaseCounts,
  WorkloadStatuses,
  PodsStreamEvent,
  PodLogsStreamEvent,
  PodResource,
  PodDetail,
  PodLogLine,
  PodExecResult,
  DeploymentResource,
  DeploymentDetail,
  DeploymentLogLine,
  ConfigResource,
  ConfigDetail,
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
  const suspendRaw = record.suspend
  const suspend = typeof suspendRaw === 'boolean'
    ? suspendRaw
    : String(suspendRaw ?? '').toLowerCase() === 'true'

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

export function toPodLogsStreamEvent(data: unknown): PodLogsStreamEvent {
  const record = (data ?? {}) as Record<string, unknown>
  return {
    streamId: String(record.streamId ?? ''),
    clusterFilename: String(record.clusterFilename ?? ''),
    namespace: String(record.namespace ?? ''),
    podName: String(record.podName ?? ''),
    items: toPodLogLines(record.items),
    updatedAtUnix: Number(record.updatedAtUnix ?? 0),
    error: record.error ? String(record.error) : undefined,
  }
}

function toPodDetailContainer(data: unknown) {
  const container = (data ?? {}) as Record<string, unknown>

  const env = Array.isArray(container.env)
    ? container.env.map(item => {
      const envItem = (item ?? {}) as Record<string, unknown>
      return {
        name: String(envItem.name ?? '-'),
        value: String(envItem.value ?? '-'),
      }
    })
    : []

  const mounts = Array.isArray(container.mounts)
    ? container.mounts.map(item => {
      const mountItem = (item ?? {}) as Record<string, unknown>
      return {
        name: String(mountItem.name ?? '-'),
        mountPath: String(mountItem.mountPath ?? '-'),
        readOnly: Boolean(mountItem.readOnly),
        subPath: String(mountItem.subPath ?? '-'),
      }
    })
    : []

  const ports = Array.isArray(container.ports)
    ? container.ports.map(item => {
      const portItem = (item ?? {}) as Record<string, unknown>
      return {
        name: String(portItem.name ?? '-'),
        containerPort: Number(portItem.containerPort ?? 0),
        protocol: String(portItem.protocol ?? 'TCP'),
      }
    })
    : []

  const command = Array.isArray(container.command)
    ? container.command.map(item => String(item ?? ''))
    : []

  const args = Array.isArray(container.args)
    ? container.args.map(item => String(item ?? ''))
    : []

  const requestsRecord = (container.requests ?? {}) as Record<string, unknown>
  const limitsRecord = (container.limits ?? {}) as Record<string, unknown>

  return {
    name: String(container.name ?? ''),
    image: String(container.image ?? '-'),
    imagePullPolicy: String(container.imagePullPolicy ?? '-'),
    containerId: String(container.containerId ?? '-'),
    state: String(container.state ?? 'unknown'),
    ready: Boolean(container.ready),
    restarts: Number(container.restarts ?? 0),
    command,
    args,
    env,
    mounts,
    ports,
    requests: {
      cpu: String(requestsRecord.cpu ?? '-'),
      memory: String(requestsRecord.memory ?? '-'),
    },
    limits: {
      cpu: String(limitsRecord.cpu ?? '-'),
      memory: String(limitsRecord.memory ?? '-'),
    },
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
    ? record.containers.map(toPodDetailContainer)
    : []

  const initContainers = Array.isArray(record.initContainers)
    ? record.initContainers.map(toPodDetailContainer)
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

  const events = Array.isArray(record.events)
    ? record.events.map(item => {
      const event = (item ?? {}) as Record<string, unknown>
      return {
        type: String(event.type ?? '-'),
        reason: String(event.reason ?? '-'),
        message: String(event.message ?? '-'),
        count: Number(event.count ?? 0),
        age: String(event.age ?? '-'),
      }
    })
    : []

  return {
    name: String(record.name ?? ''),
    namespace: String(record.namespace ?? ''),
    status: String(record.status ?? ''),
    phase: String(record.phase ?? ''),
    age: String(record.age ?? '-'),
    cpuUsage: String(record.cpuUsage ?? '-'),
    memoryUsage: String(record.memoryUsage ?? '-'),
    cpuUsageMilli: Number(record.cpuUsageMilli ?? 0),
    memoryUsageBytes: Number(record.memoryUsageBytes ?? 0),
    cpuRequestsMilli: Number(record.cpuRequestsMilli ?? 0),
    cpuLimitsMilli: Number(record.cpuLimitsMilli ?? 0),
    memoryRequestsBytes: Number(record.memoryRequestsBytes ?? 0),
    memoryLimitsBytes: Number(record.memoryLimitsBytes ?? 0),
    metricsAvailable: Boolean(record.metricsAvailable),
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
    initContainers,
    containers,
    conditions,
    events,
    manifest: String(record.manifest ?? '-'),
  }
}

export function toPodLogLines(data: unknown): PodLogLine[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.map(item => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      container: String(record.container ?? '-'),
      createdAt: String(record.createdAt ?? '-'),
      createdAtUnix: Number(record.createdAtUnix ?? 0),
      message: String(record.message ?? ''),
    }
  })
}

export function toPodExecResult(data: unknown): PodExecResult {
  const record = (data ?? {}) as Record<string, unknown>
  return {
    container: String(record.container ?? ''),
    command: String(record.command ?? ''),
    stdout: String(record.stdout ?? ''),
    stderr: String(record.stderr ?? ''),
    exitCode: Number(record.exitCode ?? 0),
  }
}

export function toDeploymentResources(data: unknown): DeploymentResource[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.map(item => {
    const record = (item ?? {}) as Record<string, unknown>
    const labelsRecord = (record.labels ?? {}) as Record<string, unknown>
    const annotationsRecord = (record.annotations ?? {}) as Record<string, unknown>
    return {
      name: String(record.name ?? ''),
      namespace: String(record.namespace ?? ''),
      pods: String(record.pods ?? '-'),
      replicas: Number(record.replicas ?? 0),
      desired: Number(record.desired ?? record.replicas ?? 0),
      current: Number(record.current ?? 0),
      ready: Number(record.ready ?? 0),
      upToDate: Number(record.upToDate ?? 0),
      available: Number(record.available ?? 0),
      nodeSelector: String(record.nodeSelector ?? '-'),
      completions: String(record.completions ?? '-'),
      conditions: String(record.conditions ?? '-'),
      schedule: String(record.schedule ?? '-'),
      suspend: String(record.suspend ?? '-'),
      active: Number(record.active ?? 0),
      last: String(record.last ?? '-'),
      next: String(record.next ?? '-'),
      status: String(record.status ?? ''),
      createdAtUnix: Number(record.createdAtUnix ?? 0),
      age: String(record.age ?? '-'),
      labels: Object.fromEntries(
        Object.entries(labelsRecord).map(([key, value]) => [key, String(value ?? '')]),
      ),
      annotations: Object.fromEntries(
        Object.entries(annotationsRecord).map(([key, value]) => [key, String(value ?? '')]),
      ),
    }
  })
}

export function toDeploymentDetail(data: unknown): DeploymentDetail {
  const record = (data ?? {}) as Record<string, unknown>

  const labelsRecord = (record.labels ?? {}) as Record<string, unknown>
  const annotationsRecord = (record.annotations ?? {}) as Record<string, unknown>
  const selectorRecord = (record.selector ?? {}) as Record<string, unknown>
  const nodeSelectorRecord = (record.nodeSelector ?? {}) as Record<string, unknown>

  const containers = Array.isArray(record.containers)
    ? record.containers.map(toPodDetailContainer)
    : []

  const revisions = Array.isArray(record.revisions)
    ? record.revisions.map(item => {
      const value = (item ?? {}) as Record<string, unknown>
      return {
        revision: String(value.revision ?? '-'),
        replicaSet: String(value.replicaSet ?? '-'),
        replicas: Number(value.replicas ?? 0),
        ready: Number(value.ready ?? 0),
        age: String(value.age ?? '-'),
      }
    })
    : []

  const pods = Array.isArray(record.pods)
    ? record.pods.map(item => {
      const value = (item ?? {}) as Record<string, unknown>
      return {
        name: String(value.name ?? '-'),
        node: String(value.node ?? '-'),
        namespace: String(value.namespace ?? '-'),
        ready: String(value.ready ?? '-'),
        cpu: String(value.cpu ?? '-'),
        memory: String(value.memory ?? '-'),
        status: String(value.status ?? '-'),
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

  const events = Array.isArray(record.events)
    ? record.events.map(item => {
      const event = (item ?? {}) as Record<string, unknown>
      return {
        type: String(event.type ?? '-'),
        reason: String(event.reason ?? '-'),
        message: String(event.message ?? '-'),
        count: Number(event.count ?? 0),
        age: String(event.age ?? '-'),
      }
    })
    : []

  const tolerations = Array.isArray(record.tolerations)
    ? record.tolerations.map(item => String(item ?? '-'))
    : []
  const nodeAffinities = Array.isArray(record.nodeAffinities)
    ? record.nodeAffinities.map(item => String(item ?? '-'))
    : []
  const podAntiAffinities = Array.isArray(record.podAntiAffinities)
    ? record.podAntiAffinities.map(item => String(item ?? '-'))
    : []
  const suspendRaw = record.suspend
  const suspend = typeof suspendRaw === 'boolean'
    ? suspendRaw
    : String(suspendRaw ?? '').toLowerCase() === 'true'

  return {
    name: String(record.name ?? ''),
    namespace: String(record.namespace ?? ''),
    status: String(record.status ?? '-'),
    replicas: Number(record.replicas ?? 0),
    current: Number(record.current ?? 0),
    ready: Number(record.ready ?? 0),
    updated: Number(record.updated ?? 0),
    available: Number(record.available ?? 0),
    unavailable: Number(record.unavailable ?? 0),
    completions: String(record.completions ?? '-'),
    schedule: String(record.schedule ?? '-'),
    suspend,
    active: Number(record.active ?? 0),
    lastSchedule: String(record.lastSchedule ?? '-'),
    nextSchedule: String(record.nextSchedule ?? '-'),
    age: String(record.age ?? '-'),
    created: String(record.created ?? '-'),
    uid: String(record.uid ?? '-'),
    resourceVersion: String(record.resourceVersion ?? '-'),
    labels: Object.fromEntries(
      Object.entries(labelsRecord).map(([key, value]) => [key, String(value ?? '')]),
    ),
    annotations: Object.fromEntries(
      Object.entries(annotationsRecord).map(([key, value]) => [key, String(value ?? '')]),
    ),
    selector: Object.fromEntries(
      Object.entries(selectorRecord).map(([key, value]) => [key, String(value ?? '')]),
    ),
    nodeSelector: Object.fromEntries(
      Object.entries(nodeSelectorRecord).map(([key, value]) => [key, String(value ?? '')]),
    ),
    strategyType: String(record.strategyType ?? '-'),
    conditions,
    tolerations,
    nodeAffinities,
    podAntiAffinities,
    containers,
    revisions,
    pods,
    events,
    manifest: String(record.manifest ?? '-'),
    scaleSupported: Boolean(record.scaleSupported ?? false),
  }
}

export function toDeploymentLogLines(data: unknown): DeploymentLogLine[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.map(item => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      podName: String(record.podName ?? '-'),
      container: String(record.container ?? '-'),
      createdAt: String(record.createdAt ?? '-'),
      createdAtUnix: Number(record.createdAtUnix ?? 0),
      message: String(record.message ?? ''),
    }
  })
}

function toLabelsMap(value: unknown): Record<string, string> {
  const record = (value ?? {}) as Record<string, unknown>
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, String(item ?? '')]),
  )
}

function parseKeysCount(record: Record<string, unknown>): number {
  if (typeof record.replicas === 'number' && Number.isFinite(record.replicas)) {
    return Math.max(0, Math.trunc(record.replicas))
  }
  const podsValue = String(record.pods ?? '').trim()
  const parsed = Number.parseInt(podsValue, 10)
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0
}

export function toConfigResources(data: unknown): ConfigResource[] {
  if (!Array.isArray(data)) {
    return []
  }

  return data.map(item => {
    const record = (item ?? {}) as Record<string, unknown>
    return {
      name: String(record.name ?? ''),
      namespace: String(record.namespace ?? ''),
      keys: parseKeysCount(record),
      type: String(record.status ?? '-'),
      createdAtUnix: Number(record.createdAtUnix ?? 0),
      age: String(record.age ?? '-'),
      labels: toLabelsMap(record.labels),
      annotations: toLabelsMap(record.annotations),
    }
  })
}

export function toConfigDetail(data: unknown): ConfigDetail {
  const record = (data ?? {}) as Record<string, unknown>
  const events = Array.isArray(record.events)
    ? record.events.map(item => {
      const event = (item ?? {}) as Record<string, unknown>
      return {
        type: String(event.type ?? '-'),
        reason: String(event.reason ?? '-'),
        message: String(event.message ?? '-'),
        count: Number(event.count ?? 0),
        age: String(event.age ?? '-'),
      }
    })
    : []

  return {
    name: String(record.name ?? ''),
    namespace: String(record.namespace ?? ''),
    type: String(record.status ?? '-'),
    created: String(record.created ?? '-'),
    uid: String(record.uid ?? '-'),
    resourceVersion: String(record.resourceVersion ?? '-'),
    labels: toLabelsMap(record.labels),
    annotations: toLabelsMap(record.annotations),
    data: toLabelsMap(record.selector),
    events,
    manifest: String(record.manifest ?? '-'),
  }
}

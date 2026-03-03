export interface PodResource {
  name: string;
  namespace: string;
  cpu: string;
  memory: string;
  controlledBy: string;
  status: string;
  createdAtUnix?: number;
  age?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface PodDetailContainer {
  name: string;
  image: string;
  imagePullPolicy: string;
  containerId: string;
  state: string;
  ready: boolean;
  restarts: number;
  command: string[];
  args: string[];
  env: PodDetailEnvVar[];
  mounts: PodDetailMount[];
  ports: PodDetailPort[];
  requests: PodDetailResources;
  limits: PodDetailResources;
}

export interface PodDetailEnvVar {
  name: string;
  value: string;
}

export interface PodDetailMount {
  name: string;
  mountPath: string;
  readOnly: boolean;
  subPath: string;
}

export interface PodDetailPort {
  name: string;
  containerPort: number;
  protocol: string;
}

export interface PodDetailResources {
  cpu: string;
  memory: string;
}

export interface PodDetailCondition {
  type: string;
  status: string;
  message: string;
}

export interface PodDetailOwnerReference {
  kind: string;
  name: string;
  uid: string;
  controller: boolean;
}

export interface PodDetailVolume {
  name: string;
  type: string;
  details: string;
}

export interface PodDetail {
  name: string;
  namespace: string;
  status: string;
  phase: string;
  age: string;
  cpuUsage: string;
  memoryUsage: string;
  cpuUsageMilli: number;
  memoryUsageBytes: number;
  cpuRequestsMilli: number;
  cpuLimitsMilli: number;
  memoryRequestsBytes: number;
  memoryLimitsBytes: number;
  metricsAvailable: boolean;
  podIP: string;
  node: string;
  qosClass: string;
  restartCount: number;
  controlledBy: string;
  created: string;
  uid: string;
  resourceVersion: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  ownerReferences: PodDetailOwnerReference[];
  volumes: PodDetailVolume[];
  initContainers: PodDetailContainer[];
  containers: PodDetailContainer[];
  conditions: PodDetailCondition[];
  events: PodDetailEvent[];
  manifest: string;
}

export interface PodDetailEvent {
  type: string;
  reason: string;
  message: string;
  count: number;
  age: string;
}

export interface PodLogLine {
  container: string;
  createdAt: string;
  createdAtUnix: number;
  message: string;
}

export interface PodExecResult {
  container: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface PodsStreamEvent {
  streamId: string;
  clusterFilename: string;
  items: PodResource[];
  metricsAvailable: boolean;
  updatedAtUnix: number;
  error?: string;
}

export interface PodLogsStreamEvent {
  streamId: string;
  clusterFilename: string;
  namespace: string;
  podName: string;
  items: PodLogLine[];
  updatedAtUnix: number;
  error?: string;
}

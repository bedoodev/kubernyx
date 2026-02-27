export interface PodResource {
  name: string;
  namespace: string;
  cpu: string;
  memory: string;
  controlledBy: string;
  status: string;
  createdAtUnix?: number;
  age?: string;
}

export interface PodDetailContainer {
  name: string;
  image: string;
  state: string;
  ready: boolean;
  restarts: number;
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
  containers: PodDetailContainer[];
  conditions: PodDetailCondition[];
}

export interface PodsStreamEvent {
  streamId: string;
  clusterFilename: string;
  items: PodResource[];
  metricsAvailable: boolean;
  updatedAtUnix: number;
  error?: string;
}

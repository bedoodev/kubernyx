export interface DeploymentResource {
  name: string;
  namespace: string;
  pods: string;
  replicas: number;
  desired?: number;
  current?: number;
  ready?: number;
  upToDate?: number;
  available?: number;
  nodeSelector?: string;
  status: string;
  createdAtUnix?: number;
  age?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

export interface DeploymentDetailRevision {
  revision: string;
  replicaSet: string;
  replicas: number;
  ready: number;
  age: string;
}

export interface DeploymentDetailPod {
  name: string;
  node: string;
  namespace: string;
  ready: string;
  cpu: string;
  memory: string;
  status: string;
}

export interface DeploymentLogLine {
  podName: string;
  container: string;
  createdAt: string;
  createdAtUnix: number;
  message: string;
}

export interface DeploymentDetail {
  name: string;
  namespace: string;
  status: string;
  replicas: number;
  current?: number;
  ready: number;
  updated: number;
  available: number;
  unavailable: number;
  age: string;
  created: string;
  uid: string;
  resourceVersion: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  selector: Record<string, string>;
  nodeSelector?: Record<string, string>;
  strategyType: string;
  conditions: Array<{ type: string; status: string; message: string }>;
  tolerations: string[];
  nodeAffinities: string[];
  podAntiAffinities: string[];
  containers: Array<{
    name: string;
    image: string;
    imagePullPolicy: string;
    containerId: string;
    state: string;
    ready: boolean;
    restarts: number;
    command: string[];
    args: string[];
    env: Array<{ name: string; value: string }>;
    mounts: Array<{ name: string; mountPath: string; readOnly: boolean; subPath: string }>;
    ports: Array<{ name: string; containerPort: number; protocol: string }>;
    requests: { cpu: string; memory: string };
    limits: { cpu: string; memory: string };
  }>;
  revisions: DeploymentDetailRevision[];
  pods: DeploymentDetailPod[];
  events: Array<{ type: string; reason: string; message: string; count: number; age: string }>;
  manifest: string;
  scaleSupported?: boolean;
}

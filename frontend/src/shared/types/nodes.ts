export interface NodeResource {
  name: string;
  role: string;
  status: string;
  version: string;
  cpu: string;
  memory: string;
  pods: string;
  createdAtUnix?: number;
  age?: string;
  labels?: Record<string, string>;
}

export interface NodeConditionInfo {
  type: string;
  status: string;
  reason: string;
  message: string;
  age: string;
}

export interface NodeTaint {
  key: string;
  value: string;
  effect: string;
}

export interface NodeAddress {
  type: string;
  address: string;
}

export interface NodeDetail {
  name: string;
  role: string;
  status: string;
  version: string;
  kernelVersion: string;
  os: string;
  architecture: string;
  containerRuntime: string;
  cpu: string;
  memory: string;
  pods: string;
  cpuAllocatable: string;
  memAllocatable: string;
  podAllocatable: string;
  age: string;
  created: string;
  uid: string;
  labels: Record<string, string>;
  annotations: Record<string, string>;
  conditions: NodeConditionInfo[];
  taints: NodeTaint[];
  addresses: NodeAddress[];
  events: Array<{ type: string; reason: string; message: string; count: number; age: string }>;
  manifest: string;
}

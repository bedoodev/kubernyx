export interface NodeSummary {
  total: number;
  ready: number;
  notReady: number;
  masters: number;
  workers: number;
}

export interface ResourceMetrics {
  cpuUsage: number;
  cpuRequests: number;
  cpuLimits: number;
  cpuAllocatable: number;
  memUsage: number;
  memRequests: number;
  memLimits: number;
  memAllocatable: number;
  podCapacity: number;
  podUsage: number;
  metricsAvailable: boolean;
}

export interface ClusterOverview {
  nodeSummary: NodeSummary;
  resources: ResourceMetrics;
  namespaces: string[];
}

export type NodeFilter = 'both' | 'master' | 'worker';

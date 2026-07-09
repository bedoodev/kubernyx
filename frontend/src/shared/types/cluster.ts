export type ClusterHealthStatus = 'green' | 'yellow' | 'red';
export type ClusterSection = 'overview' | 'workloads' | 'config' | 'network' | 'rbac' | 'nodes' | 'events';

export interface ClusterInfo {
  name: string;
  filename: string;
  healthStatus?: ClusterHealthStatus;
}

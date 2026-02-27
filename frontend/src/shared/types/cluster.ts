export type ClusterHealthStatus = 'green' | 'yellow' | 'red';
export type ClusterSection = 'overview' | 'workloads';

export interface ClusterInfo {
  name: string;
  filename: string;
  healthStatus?: ClusterHealthStatus;
}

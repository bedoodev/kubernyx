export type WorkloadTabId =
  | 'pods'
  | 'deployments'
  | 'daemon-sets'
  | 'stateful-sets'
  | 'replica-sets'
  | 'jobs'
  | 'cronjobs';

export interface WorkloadTabOption {
  id: WorkloadTabId;
  label: string;
}

export const WORKLOAD_TAB_OPTIONS: WorkloadTabOption[] = [
  { id: 'pods', label: 'Pods' },
  { id: 'deployments', label: 'Deployments' },
  { id: 'daemon-sets', label: 'Daemon Sets' },
  { id: 'stateful-sets', label: 'Stateful Sets' },
  { id: 'replica-sets', label: 'Replica Sets' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'cronjobs', label: 'Cronjobs' },
];

export interface WorkloadCounts {
  pods: number;
  podRunning: number;
  podPending: number;
  podFailed: number;
  podSucceeded: number;
  deployments: number;
  replicaSets: number;
  statefulSets: number;
  daemonSets: number;
  jobs: number;
  cronJobs: number;
  statuses: WorkloadStatuses;
}

export interface WorkloadPhaseCounts {
  running: number;
  pending: number;
  failed: number;
  succeeded: number;
}

export interface WorkloadStatuses {
  pods: WorkloadPhaseCounts;
  deployments: WorkloadPhaseCounts;
  replicaSets: WorkloadPhaseCounts;
  statefulSets: WorkloadPhaseCounts;
  daemonSets: WorkloadPhaseCounts;
  jobs: WorkloadPhaseCounts;
  cronJobs: WorkloadPhaseCounts;
}

import type { WorkloadTabId } from '../../shared/types'

export type NonPodWorkloadTabId = Exclude<WorkloadTabId, 'pods'>
export type WorkloadAPIKind = 'deployment' | 'daemonset' | 'statefulset' | 'job' | 'cronjob'

export function toWorkloadAPIKind(tab: NonPodWorkloadTabId): WorkloadAPIKind {
  switch (tab) {
    case 'deployments':
      return 'deployment'
    case 'daemon-sets':
      return 'daemonset'
    case 'stateful-sets':
      return 'statefulset'
    case 'jobs':
      return 'job'
    case 'cronjobs':
      return 'cronjob'
    default:
      return 'deployment'
  }
}

export function workloadSingularLabel(tab: NonPodWorkloadTabId): string {
  switch (tab) {
    case 'deployments':
      return 'Deployment'
    case 'daemon-sets':
      return 'Daemon Set'
    case 'stateful-sets':
      return 'Stateful Set'
    case 'jobs':
      return 'Job'
    case 'cronjobs':
      return 'CronJob'
    default:
      return 'Workload'
  }
}

export function workloadPluralLabel(tab: NonPodWorkloadTabId): string {
  switch (tab) {
    case 'deployments':
      return 'Deployments'
    case 'daemon-sets':
      return 'Daemon Sets'
    case 'stateful-sets':
      return 'Stateful Sets'
    case 'jobs':
      return 'Jobs'
    case 'cronjobs':
      return 'CronJobs'
    default:
      return 'Workloads'
  }
}

export function supportsRestart(tab: NonPodWorkloadTabId): boolean {
  return tab === 'deployments' || tab === 'daemon-sets' || tab === 'stateful-sets'
}

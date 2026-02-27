import type { WorkloadCounts } from '../../../shared/types'
import './WorkloadBars.css'

interface Props {
  workloads: WorkloadCounts
}

type WorkloadKey = 'pods' | 'deployments' | 'replicaSets' | 'statefulSets' | 'daemonSets' | 'jobs' | 'cronJobs'
type WorkloadStatusKey = keyof WorkloadCounts['statuses']

const WORKLOAD_CONFIG: { key: WorkloadKey; statusKey: WorkloadStatusKey; label: string; color: string }[] = [
  { key: 'pods', statusKey: 'pods', label: 'Pods', color: 'var(--accent)' },
  { key: 'deployments', statusKey: 'deployments', label: 'Deployments', color: 'var(--green)' },
  { key: 'replicaSets', statusKey: 'replicaSets', label: 'ReplicaSets', color: 'var(--cyan)' },
  { key: 'statefulSets', statusKey: 'statefulSets', label: 'StatefulSets', color: 'var(--purple)' },
  { key: 'daemonSets', statusKey: 'daemonSets', label: 'DaemonSets', color: 'var(--orange)' },
  { key: 'jobs', statusKey: 'jobs', label: 'Jobs', color: 'var(--yellow)' },
  { key: 'cronJobs', statusKey: 'cronJobs', label: 'CronJobs', color: 'var(--red)' },
]

const STATUS_SEGMENTS: { key: 'running' | 'pending' | 'failed' | 'succeeded'; color: string }[] = [
  { key: 'running', color: 'var(--green)' },
  { key: 'pending', color: 'var(--yellow)' },
  { key: 'failed', color: 'var(--red)' },
  { key: 'succeeded', color: 'var(--cyan)' },
]

const WORKLOAD_PHASE_CONFIG: { key: 'running' | 'pending' | 'failed' | 'succeeded'; label: string; color: string }[] = [
  { key: 'running', label: 'Running', color: 'var(--green)' },
  { key: 'pending', label: 'Pending', color: 'var(--yellow)' },
  { key: 'failed', label: 'Failed', color: 'var(--red)' },
  { key: 'succeeded', label: 'Succeeded', color: 'var(--cyan)' },
]

function getSegments(count: number, status: WorkloadCounts['statuses'][WorkloadStatusKey], fallbackColor: string) {
  if (count <= 0) {
    return [] as { key: string; width: number; color: string }[]
  }

  const totalByStatus = STATUS_SEGMENTS.reduce((sum, segment) => sum + (status?.[segment.key] ?? 0), 0)
  if (totalByStatus <= 0) {
    return [{ key: 'fallback', width: 100, color: fallbackColor }]
  }

  return STATUS_SEGMENTS
    .map(segment => ({
      key: segment.key,
      width: ((status?.[segment.key] ?? 0) / totalByStatus) * 100,
      color: segment.color,
    }))
    .filter(segment => segment.width > 0)
}

export default function WorkloadBars({ workloads }: Props) {
  const maxCount = Math.max(1, ...WORKLOAD_CONFIG.map(w => workloads[w.key]))

  return (
    <div className="workload-section">
      <h3 className="workload-title">Workloads</h3>
      <div className="workload-bars">
        {WORKLOAD_CONFIG.map(w => {
          const count = workloads[w.key]
          const pct = (count / maxCount) * 100
          const hasInfo = count > 0
          const status = workloads.statuses[w.statusKey]
          const segments = getSegments(count, status, w.color)
          return (
            <div key={w.key} className={`workload-row ${hasInfo ? 'has-tooltip' : ''}`}>
              <span className="wl-label">{w.label}</span>
              <div className="wl-track-wrap">
                <div className="wl-track">
                  <div className="wl-fill-multi" style={{ width: `${pct}%` }}>
                    {segments.map(segment => (
                      <div
                        key={`${w.key}-${segment.key}`}
                        className="wl-segment"
                        style={{ width: `${segment.width}%`, background: segment.color }}
                      />
                    ))}
                  </div>
                </div>
                {hasInfo && (
                  <div className="workload-tooltip" role="tooltip">
                    {WORKLOAD_PHASE_CONFIG.map(phase => (
                      <div key={`${w.key}-${phase.key}`} className="workload-tooltip-row">
                        <span className="workload-tooltip-dot" style={{ background: phase.color }} />
                        <span className="workload-tooltip-label">{phase.label}</span>
                        <span className="workload-tooltip-value">{status[phase.key]}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <span className="wl-count">{count}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

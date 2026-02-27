import type { ResourceMetrics, WorkloadCounts } from '../../../shared/types'
import { formatCPU, formatMem, formatInt, toPercent } from '../../../shared/utils/formatting'
import './ResourceCharts.css'

interface Props {
  resources: ResourceMetrics
  workloads?: WorkloadCounts | null
}

interface RingMetric {
  label: string
  value: number
  color: string
}

interface LegendItem {
  label: string
  value: string
  color: string
}

const COLORS = {
  usage: 'var(--chart-usage)',
  requests: 'var(--chart-requests)',
  limits: 'var(--chart-limits)',
  allocatable: 'var(--chart-allocatable)',
  capacity: 'var(--chart-capacity)',
} as const

function RingGauge({ metrics, total, tooltipItems }: {
  metrics: RingMetric[]
  total: number
  tooltipItems?: LegendItem[]
}) {
  const rings = metrics.length === 1
    ? [{ radius: 50, width: 11, metric: metrics[0] }]
    : metrics.slice(0, 3).map((metric, index) => ({
      metric,
      radius: 52 - index * 10,
      width: 8,
    }))

  return (
    <div className={`resource-ring ${tooltipItems && tooltipItems.length > 0 ? 'has-tooltip' : ''}`}>
      <svg width="160" height="160" viewBox="0 0 140 140" aria-hidden="true">
        {rings.map(({ metric, radius, width }) => {
          const pct = toPercent(metric.value, total)
          const circumference = 2 * Math.PI * radius
          const offset = circumference - (pct / 100) * circumference
          return (
            <g key={metric.label}>
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke="rgba(37, 52, 82, 0.9)"
                strokeWidth={width}
              />
              <circle
                cx="70"
                cy="70"
                r={radius}
                fill="none"
                stroke={metric.color}
                strokeWidth={width}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                transform="rotate(-90 70 70)"
                style={{ transition: 'stroke-dashoffset 0.4s ease' }}
              />
            </g>
          )
        })}
      </svg>
      {tooltipItems && tooltipItems.length > 0 && (
        <div className="ring-tooltip" role="tooltip">
          {tooltipItems.map(item => (
            <div key={item.label} className="ring-tooltip-row">
              <span className="ring-tooltip-dot" style={{ background: item.color }} />
              <span className="ring-tooltip-label">{item.label}</span>
              <span className="ring-tooltip-value">{item.value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ResourceCard({ title, total, rings, legend, ringTooltipItems }: {
  title: string
  total: number
  rings: RingMetric[]
  legend: LegendItem[]
  ringTooltipItems?: LegendItem[]
}) {
  return (
    <section className="resource-card">
      <h3 className="resource-card-title">{title}</h3>
      <RingGauge metrics={rings} total={total} tooltipItems={ringTooltipItems} />
      <div className="resource-legend">
        {legend.map(item => (
          <div key={item.label} className="resource-legend-row">
            <span className="resource-legend-dot" style={{ background: item.color }} />
            <span className="resource-legend-label">{item.label}</span>
            <span className="resource-legend-value">{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ResourceCharts({ resources, workloads }: Props) {
  const cpuUsage = resources.metricsAvailable ? resources.cpuUsage : 0
  const memUsage = resources.metricsAvailable ? resources.memUsage : 0

  return (
    <div className="resource-charts">
      <ResourceCard
        title="CPU"
        total={resources.cpuAllocatable}
        rings={[
          { label: 'Usage', value: cpuUsage, color: COLORS.usage },
          { label: 'Requests', value: resources.cpuRequests, color: COLORS.requests },
          { label: 'Limits', value: resources.cpuLimits, color: COLORS.limits },
        ]}
        legend={[
          { label: 'Usage:', value: formatCPU(cpuUsage), color: COLORS.usage },
          { label: 'Requests:', value: formatCPU(resources.cpuRequests), color: COLORS.requests },
          { label: 'Limits:', value: formatCPU(resources.cpuLimits), color: COLORS.limits },
          { label: 'Allocatable:', value: formatCPU(resources.cpuAllocatable), color: COLORS.allocatable },
          { label: 'Capacity:', value: formatCPU(resources.cpuAllocatable), color: COLORS.capacity },
        ]}
      />

      <ResourceCard
        title="Memory"
        total={resources.memAllocatable}
        rings={[
          { label: 'Usage', value: memUsage, color: COLORS.usage },
          { label: 'Requests', value: resources.memRequests, color: COLORS.requests },
          { label: 'Limits', value: resources.memLimits, color: COLORS.limits },
        ]}
        legend={[
          { label: 'Usage:', value: formatMem(memUsage), color: COLORS.usage },
          { label: 'Requests:', value: formatMem(resources.memRequests), color: COLORS.requests },
          { label: 'Limits:', value: formatMem(resources.memLimits), color: COLORS.limits },
          { label: 'Allocatable:', value: formatMem(resources.memAllocatable), color: COLORS.allocatable },
          { label: 'Capacity:', value: formatMem(resources.memAllocatable), color: COLORS.capacity },
        ]}
      />

      <ResourceCard
        title="Pods"
        total={resources.podCapacity}
        rings={[
          { label: 'Usage', value: resources.podUsage, color: COLORS.usage },
        ]}
        ringTooltipItems={[
          { label: 'Running', value: formatInt(workloads?.statuses.pods.running ?? 0), color: 'var(--green)' },
          { label: 'Pending', value: formatInt(workloads?.statuses.pods.pending ?? 0), color: 'var(--yellow)' },
          { label: 'Failed', value: formatInt(workloads?.statuses.pods.failed ?? 0), color: 'var(--red)' },
          { label: 'Succeeded', value: formatInt(workloads?.statuses.pods.succeeded ?? 0), color: 'var(--cyan)' },
        ]}
        legend={[
          { label: 'Usage:', value: formatInt(resources.podUsage), color: COLORS.usage },
          { label: 'Allocatable:', value: formatInt(resources.podCapacity), color: COLORS.allocatable },
          { label: 'Capacity:', value: formatInt(resources.podCapacity), color: COLORS.capacity },
        ]}
      />
    </div>
  )
}

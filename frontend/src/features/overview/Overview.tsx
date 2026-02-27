import type { ClusterInfo, ClusterOverview, WorkloadCounts, NodeFilter } from '../../shared/types'
import SummaryCards from './components/SummaryCards'
import ResourceCharts from './components/ResourceCharts'
import NamespaceFilter from '../namespace-filter/NamespaceFilter'
import WorkloadBars from './components/WorkloadBars'
import './Overview.css'

interface Props {
  cluster: ClusterInfo
  overview: ClusterOverview | null
  workloads: WorkloadCounts | null
  nodeFilter: NodeFilter
  selectedNamespaces: string[]
  loading: boolean
  error: string | null
  onNodeFilterChange: (f: NodeFilter) => void
  onNamespacesChange: (ns: string[]) => void
}

const NODE_FILTERS: { value: NodeFilter; label: string }[] = [
  { value: 'both', label: 'Both' },
  { value: 'master', label: 'Master' },
  { value: 'worker', label: 'Worker' },
]

export default function Overview({ cluster, overview, workloads, nodeFilter, selectedNamespaces, loading, error, onNodeFilterChange, onNamespacesChange }: Props) {
  if (loading) {
    return (
      <div className="overview-loading">
        <div className="spinner" />
        <span>Connecting to {cluster.name}...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="overview-error">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--red)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
        </svg>
        <h3>Connection Failed</h3>
        <p>{error}</p>
      </div>
    )
  }

  if (!overview) return null

  return (
    <div className="overview">
      <div className="overview-header">
        <h1>{cluster.name}</h1>
        <div className="node-filter">
          {NODE_FILTERS.map(f => (
            <button
              key={f.value}
              className={`filter-btn ${nodeFilter === f.value ? 'active' : ''}`}
              onClick={() => onNodeFilterChange(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <SummaryCards summary={overview.nodeSummary} />

      <ResourceCharts resources={overview.resources} workloads={workloads} />

      <div className="section-divider" />

      <NamespaceFilter
        namespaces={overview.namespaces}
        selected={selectedNamespaces}
        onChange={onNamespacesChange}
      />

      {workloads && <WorkloadBars workloads={workloads} />}
    </div>
  )
}

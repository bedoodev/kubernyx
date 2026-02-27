import { useMemo } from 'react'
import { WORKLOAD_TAB_OPTIONS } from '../types'
import type { ClusterInfo, WorkloadTabId } from '../types'
import './WorkloadsView.css'

interface Props {
  cluster: ClusterInfo
  activeTab: WorkloadTabId
  onTabChange: (tab: WorkloadTabId) => void
}

export default function WorkloadsView({ cluster, activeTab, onTabChange }: Props) {
  const activeLabel = useMemo(
    () => WORKLOAD_TAB_OPTIONS.find(tab => tab.id === activeTab)?.label ?? 'Workloads',
    [activeTab],
  )

  return (
    <div className="workloads-view">
      <div className="workloads-view-header">
        <h1>{cluster.name}</h1>
      </div>

      <div className="workloads-layout">
        <aside className="workloads-menu">
          {WORKLOAD_TAB_OPTIONS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`workloads-menu-item ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => onTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <div className="workloads-panel">
          <h3>{activeLabel}</h3>
          <p>Coming soon...</p>
        </div>
      </div>
    </div>
  )
}

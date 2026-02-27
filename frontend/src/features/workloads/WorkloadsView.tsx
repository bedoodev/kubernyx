import { useMemo } from 'react'
import { WORKLOAD_TAB_OPTIONS } from '../../shared/types'
import type { ClusterInfo, WorkloadTabId } from '../../shared/types'
import NamespaceFilter from '../namespace-filter/NamespaceFilter'
import PodsTable from './pods/PodsTable'
import './WorkloadsView.css'

interface Props {
  cluster: ClusterInfo
  activeTab: WorkloadTabId
  namespaces: string[]
  selectedNamespaces: string[]
  onNamespacesChange: (ns: string[]) => void
}

export default function WorkloadsView({ cluster, activeTab, namespaces, selectedNamespaces, onNamespacesChange }: Props) {
  const activeLabel = useMemo(
    () => WORKLOAD_TAB_OPTIONS.find(tab => tab.id === activeTab)?.label ?? 'Workloads',
    [activeTab],
  )

  return (
    <div className="workloads-view">
      <div className="workloads-view-header">
        <div className="workloads-view-title">
          <p>Select one or more namespaces to list resources.</p>
        </div>
        <NamespaceFilter
          className="workloads-namespace-filter"
          namespaces={namespaces}
          selected={selectedNamespaces}
          onChange={onNamespacesChange}
        />
      </div>

      <div className={`workloads-panel ${activeTab === 'pods' ? 'pods-mode' : ''}`}>
        {activeTab === 'pods' ? (
          <PodsTable
            clusterFilename={cluster.filename}
            selectedNamespaces={selectedNamespaces}
          />
        ) : (
          <>
            <h3>{activeLabel}</h3>
            <p>Coming soon...</p>
          </>
        )}
      </div>
    </div>
  )
}

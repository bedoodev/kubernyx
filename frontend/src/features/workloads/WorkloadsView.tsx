import { WORKLOAD_TAB_OPTIONS } from '../../shared/types'
import type { ClusterInfo, PodResource, WorkloadTabId } from '../../shared/types'
import NamespaceFilter from '../namespace-filter/NamespaceFilter'
import PodsTable from './pods/PodsTable'
import './WorkloadsView.css'

interface Props {
  cluster: ClusterInfo
  activeTab: WorkloadTabId
  namespaces: string[]
  selectedNamespaces: string[]
  onNamespacesChange: (ns: string[]) => void
  activePodKey: string | null
  onPodActivate: (pod: PodResource, options: { pin: boolean }) => void
}

export default function WorkloadsView({
  cluster,
  activeTab,
  namespaces,
  selectedNamespaces,
  onNamespacesChange,
  activePodKey,
  onPodActivate,
}: Props) {
  const activeLabel = WORKLOAD_TAB_OPTIONS.find(tab => tab.id === activeTab)?.label ?? 'Workloads'

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
            showInlineDetails={false}
            externalSelectedPodKey={activePodKey}
            onPodActivate={onPodActivate}
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

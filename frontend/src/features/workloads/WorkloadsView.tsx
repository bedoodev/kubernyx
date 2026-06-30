import type { ClusterInfo, DeploymentResource, PodResource, WorkloadTabId } from '../../shared/types'
import { useScopedSearch } from '../../shared/hooks/useScopedSearch'
import NamespaceFilter from '../namespace-filter/NamespaceFilter'
import PodsTable from './pods/PodsTable'
import DeploymentsTable from './deployments/DeploymentsTable'
import type { NonPodWorkloadTabId } from './workloadKinds'
import './WorkloadsView.css'

interface Props {
  cluster: ClusterInfo
  activeTab: WorkloadTabId
  namespaces: string[]
  selectedNamespaces: string[]
  onNamespacesChange: (ns: string[]) => void
  activePodKey: string | null
  activeDeploymentKey: string | null
  onPodActivate: (pod: PodResource, options: { pin: boolean }) => void
  onDeploymentActivate: (deployment: DeploymentResource, options: { pin: boolean }) => void
  onActivePodMissing: () => void
  onActiveDeploymentMissing: () => void
}

export default function WorkloadsView({
  cluster,
  activeTab,
  namespaces,
  selectedNamespaces,
  onNamespacesChange,
  activePodKey,
  activeDeploymentKey,
  onPodActivate,
  onDeploymentActivate,
  onActivePodMissing,
  onActiveDeploymentMissing,
}: Props) {
  const [search, handleSearchChange] = useScopedSearch(`workloads:${cluster.filename}:${activeTab}`)

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
          emptyMeansAll={false}
          onChange={onNamespacesChange}
        />
      </div>

      <div className="workloads-panel pods-mode">
        {activeTab === 'pods' ? (
          <PodsTable
            clusterFilename={cluster.filename}
            selectedNamespaces={selectedNamespaces}
            showInlineDetails={false}
            externalSelectedPodKey={activePodKey}
            onPodActivate={onPodActivate}
            onActivePodMissing={onActivePodMissing}
            search={search}
            onSearchChange={handleSearchChange}
          />
        ) : (
          <DeploymentsTable
            clusterFilename={cluster.filename}
            selectedNamespaces={selectedNamespaces}
            workloadTab={activeTab as NonPodWorkloadTabId}
            externalSelectedDeploymentKey={activeDeploymentKey}
            onDeploymentActivate={onDeploymentActivate}
            onActiveDeploymentMissing={onActiveDeploymentMissing}
            search={search}
            onSearchChange={handleSearchChange}
          />
        )}
      </div>
    </div>
  )
}

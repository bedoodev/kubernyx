import type { ClusterInfo, DeploymentResource, NetworkTabId } from '../../shared/types'
import NamespaceFilter from '../namespace-filter/NamespaceFilter'
import NetworkTable from './NetworkTable'
import '../config/ConfigView.css'

interface Props {
  cluster: ClusterInfo
  activeTab: NetworkTabId
  namespaces: string[]
  selectedNamespaces: string[]
  onNamespacesChange: (ns: string[]) => void
  activeNetworkKey: string | null
  onNetworkActivate: (resource: DeploymentResource, options: { pin: boolean }) => void
}

export default function NetworkView({
  cluster,
  activeTab,
  namespaces,
  selectedNamespaces,
  onNamespacesChange,
  activeNetworkKey,
  onNetworkActivate,
}: Props) {
  return (
    <div className="config-view">
      <div className="config-view-header">
        <div className="config-view-title">
          <p>Select one or more namespaces to list network resources.</p>
        </div>
        <NamespaceFilter
          className="config-namespace-filter"
          namespaces={namespaces}
          selected={selectedNamespaces}
          emptyMeansAll={false}
          onChange={onNamespacesChange}
        />
      </div>

      <div className="config-panel">
        <NetworkTable
          clusterFilename={cluster.filename}
          selectedNamespaces={selectedNamespaces}
          networkTab={activeTab}
          externalSelectedKey={activeNetworkKey}
          onResourceActivate={onNetworkActivate}
        />
      </div>
    </div>
  )
}

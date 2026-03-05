import type { ClusterInfo, ConfigResource, ConfigTabId } from '../../shared/types'
import NamespaceFilter from '../namespace-filter/NamespaceFilter'
import ConfigTable from './ConfigTable'
import { configPluralLabel, isImplementedConfigTab } from './configKinds'
import './ConfigView.css'

interface Props {
  cluster: ClusterInfo
  activeTab: ConfigTabId
  namespaces: string[]
  selectedNamespaces: string[]
  onNamespacesChange: (ns: string[]) => void
  activeConfigKey: string | null
  onConfigActivate: (resource: ConfigResource, options: { pin: boolean }) => void
}

export default function ConfigView({
  cluster,
  activeTab,
  namespaces,
  selectedNamespaces,
  onNamespacesChange,
  activeConfigKey,
  onConfigActivate,
}: Props) {
  return (
    <div className="config-view">
      <div className="config-view-header">
        <div className="config-view-title">
          <p>Select one or more namespaces to list config resources.</p>
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
        {isImplementedConfigTab(activeTab) ? (
          <ConfigTable
            clusterFilename={cluster.filename}
            selectedNamespaces={selectedNamespaces}
            configTab={activeTab}
            externalSelectedConfigKey={activeConfigKey}
            onConfigActivate={onConfigActivate}
          />
        ) : (
          <div className="config-empty-panel">
            <h3>{configPluralLabel(activeTab)}</h3>
            <p>This section will be implemented next.</p>
          </div>
        )}
      </div>
    </div>
  )
}

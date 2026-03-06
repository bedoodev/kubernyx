import { useEffect, useMemo, useState } from 'react'
import type { NodeDetail, NodeResource } from '../../../shared/types'
import YamlEditor from '../../../shared/components/YamlEditor'
import '../../workloads/pods/PodsTable.css'

export type NodeDetailsTabId = 'overview' | 'yaml'

interface Props {
  clusterFilename: string
  mode: 'split' | 'modal'
  activeDetailsTab: NodeDetailsTabId
  onDetailsTabChange: (tab: NodeDetailsTabId) => void
  selectedNode: NodeResource
  nodeDetail: NodeDetail | null
  nodeDetailLoading: boolean
  nodeDetailError: string | null
  detailsMaximized: boolean
  showMaximizeButton?: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

const DETAIL_TABS: Array<{ id: NodeDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'yaml', label: 'YAML' },
]

function mapEntries(value: Record<string, string>): Array<[string, string]> {
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
}

export default function NodeDetailPanel({
  mode,
  activeDetailsTab,
  onDetailsTabChange,
  selectedNode,
  nodeDetail,
  nodeDetailLoading,
  nodeDetailError,
  detailsMaximized,
  showMaximizeButton = true,
  onToggleMaximize,
  onClose,
}: Props) {
  const [metadataOpenSections, setMetadataOpenSections] = useState<{
    labels: boolean
    annotations: boolean
  }>({
    labels: true,
    annotations: true,
  })

  useEffect(() => {
    setMetadataOpenSections({
      labels: true,
      annotations: true,
    })
  }, [selectedNode.name])

  const labels = useMemo(() => mapEntries(nodeDetail?.labels ?? {}), [nodeDetail?.labels])
  const annotations = useMemo(() => mapEntries(nodeDetail?.annotations ?? {}), [nodeDetail?.annotations])

  const statusClass = nodeDetail?.status === 'Ready' ? 'running' : nodeDetail?.status === 'NotReady' ? 'failed' : 'pending'

  const toggleMetadataSection = (section: 'labels' | 'annotations') => {
    setMetadataOpenSections(current => ({
      ...current,
      [section]: !current[section],
    }))
  }

  return (
    <div className={`pod-detail-panel ${mode === 'modal' ? 'is-modal' : ''}`}>
      <div className="pod-detail-header">
        <div className="pod-detail-header-top">
          <div className="pod-detail-title-row">
            <h3 className="pod-detail-name" title={selectedNode.name}>{selectedNode.name}</h3>
            <span className={`pod-detail-phase ${statusClass}`}>{nodeDetail?.status ?? selectedNode.status}</span>
          </div>
          <div className="pod-detail-header-actions">
            {showMaximizeButton && (
              <button type="button" className="pod-detail-maximize-btn" onClick={onToggleMaximize} title={detailsMaximized ? 'Restore panel' : 'Maximize panel'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {detailsMaximized ? (
                    <>
                      <polyline points="4 14 10 14 10 20" />
                      <polyline points="20 10 14 10 14 4" />
                      <line x1="14" y1="10" x2="21" y2="3" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </>
                  ) : (
                    <>
                      <polyline points="15 3 21 3 21 9" />
                      <polyline points="9 21 3 21 3 15" />
                      <line x1="21" y1="3" x2="14" y2="10" />
                      <line x1="3" y1="21" x2="10" y2="14" />
                    </>
                  )}
                </svg>
              </button>
            )}
            <button type="button" className="pod-detail-close-btn" onClick={onClose} title="Close detail panel">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6L6 18" />
                <path d="M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="pod-detail-tabs">
          {DETAIL_TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              className={`pod-detail-tab ${activeDetailsTab === tab.id ? 'active' : ''}`}
              onClick={() => onDetailsTabChange(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="pod-detail-body">
        {nodeDetailError ? (
          <div className="pods-empty-row error">{nodeDetailError}</div>
        ) : nodeDetailLoading && !nodeDetail ? (
          <div className="pods-empty-row">Loading node details...</div>
        ) : activeDetailsTab === 'yaml' ? (
          <YamlEditor value={nodeDetail?.manifest ?? '-'} />
        ) : (
          <div className="pod-detail-overview">
            <section className="pod-detail-section">
              <h4 className="pod-detail-section-title">Node Info</h4>
              <div className="pod-detail-grid">
                <div className="pod-detail-field"><span className="pod-detail-label">Name</span><span className="pod-detail-value">{nodeDetail?.name ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Role</span><span className="pod-detail-value">{nodeDetail?.role ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Status</span><span className={`pod-detail-value ${statusClass}`}>{nodeDetail?.status ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Version</span><span className="pod-detail-value">{nodeDetail?.version ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">OS</span><span className="pod-detail-value">{nodeDetail?.os ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Architecture</span><span className="pod-detail-value">{nodeDetail?.architecture ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Kernel</span><span className="pod-detail-value">{nodeDetail?.kernelVersion ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Container Runtime</span><span className="pod-detail-value">{nodeDetail?.containerRuntime ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Age</span><span className="pod-detail-value">{nodeDetail?.age ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Created</span><span className="pod-detail-value">{nodeDetail?.created ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">UID</span><span className="pod-detail-value mono">{nodeDetail?.uid ?? '-'}</span></div>
              </div>
            </section>

            <section className="pod-detail-section">
              <h4 className="pod-detail-section-title">Capacity / Allocatable</h4>
              <div className="pod-detail-grid">
                <div className="pod-detail-field"><span className="pod-detail-label">CPU</span><span className="pod-detail-value">{nodeDetail?.cpu ?? '-'} / {nodeDetail?.cpuAllocatable ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Memory</span><span className="pod-detail-value">{nodeDetail?.memory ?? '-'} / {nodeDetail?.memAllocatable ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Pods</span><span className="pod-detail-value">{nodeDetail?.pods ?? '-'} / {nodeDetail?.podAllocatable ?? '-'}</span></div>
              </div>
            </section>

            {nodeDetail?.addresses && nodeDetail.addresses.length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Addresses</h4>
                <div className="pod-detail-grid">
                  {nodeDetail.addresses.map(addr => (
                    <div key={addr.type} className="pod-detail-field">
                      <span className="pod-detail-label">{addr.type}</span>
                      <span className="pod-detail-value mono">{addr.address}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {nodeDetail?.conditions && nodeDetail.conditions.length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Conditions</h4>
                <div className="pods-table-wrap" style={{ maxHeight: '240px' }}>
                  <table className="pods-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th><div className="pods-th-content"><span className="pods-th-label">Type</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Status</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Reason</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Message</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Age</span></div></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodeDetail.conditions.map(cond => (
                        <tr key={cond.type}>
                          <td className="pods-cell">{cond.type}</td>
                          <td className={`pods-cell pods-status-cell ${cond.status === 'True' && cond.type === 'Ready' ? 'running' : cond.status === 'True' ? 'failed' : ''}`}>{cond.status}</td>
                          <td className="pods-cell">{cond.reason}</td>
                          <td className="pods-cell" title={cond.message}>{cond.message}</td>
                          <td className="pods-cell">{cond.age}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {nodeDetail?.taints && nodeDetail.taints.length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Taints</h4>
                <div className="pods-table-wrap" style={{ maxHeight: '180px' }}>
                  <table className="pods-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th><div className="pods-th-content"><span className="pods-th-label">Key</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Value</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Effect</span></div></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodeDetail.taints.map((taint, i) => (
                        <tr key={`${taint.key}-${i}`}>
                          <td className="pods-cell mono">{taint.key}</td>
                          <td className="pods-cell mono">{taint.value || '-'}</td>
                          <td className="pods-cell">{taint.effect}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <button
                  type="button"
                  className={`pods-meta-header-btn ${metadataOpenSections.labels ? 'is-open' : ''}`}
                  onClick={() => toggleMetadataSection('labels')}
                  aria-label={metadataOpenSections.labels ? 'Collapse labels' : 'Expand labels'}
                  aria-expanded={metadataOpenSections.labels}
                >
                  <div className="pods-meta-title">
                    <span className="pods-meta-chevron">▾</span>
                    <span>Labels</span>
                  </div>
                  <span className="pods-meta-count">{labels.length}</span>
                </button>
              </header>
              {!metadataOpenSections.labels ? null : labels.length === 0 ? (
                <p className="pods-meta-empty">No labels</p>
              ) : (
                <div className="pods-meta-list">
                  {labels.map(([key, value]) => (
                    <div key={key} className="pods-meta-item">
                      <span className="pods-meta-key">{key}:</span>
                      <span className="pods-meta-text-value">{value || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="pods-meta-card">
              <header className="pods-meta-card-header">
                <button
                  type="button"
                  className={`pods-meta-header-btn ${metadataOpenSections.annotations ? 'is-open' : ''}`}
                  onClick={() => toggleMetadataSection('annotations')}
                  aria-label={metadataOpenSections.annotations ? 'Collapse annotations' : 'Expand annotations'}
                  aria-expanded={metadataOpenSections.annotations}
                >
                  <div className="pods-meta-title">
                    <span className="pods-meta-chevron">▾</span>
                    <span>Annotations</span>
                  </div>
                  <span className="pods-meta-count">{annotations.length}</span>
                </button>
              </header>
              {!metadataOpenSections.annotations ? null : annotations.length === 0 ? (
                <p className="pods-meta-empty">No annotations</p>
              ) : (
                <div className="pods-meta-list">
                  {annotations.map(([key, value]) => (
                    <div key={key} className="pods-meta-item">
                      <span className="pods-meta-key">{key}:</span>
                      <span className="pods-meta-text-value">{value || '-'}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {nodeDetail?.events && nodeDetail.events.length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Events ({nodeDetail.events.length})</h4>
                <div className="pods-table-wrap" style={{ maxHeight: '240px' }}>
                  <table className="pods-table" style={{ width: '100%' }}>
                    <thead>
                      <tr>
                        <th><div className="pods-th-content"><span className="pods-th-label">Type</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Reason</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Message</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Count</span></div></th>
                        <th><div className="pods-th-content"><span className="pods-th-label">Age</span></div></th>
                      </tr>
                    </thead>
                    <tbody>
                      {nodeDetail.events.map((evt, i) => (
                        <tr key={`${evt.reason}-${i}`}>
                          <td className={`pods-cell pods-status-cell ${evt.type === 'Warning' ? 'failed' : ''}`}>{evt.type}</td>
                          <td className="pods-cell">{evt.reason}</td>
                          <td className="pods-cell" title={evt.message}>{evt.message}</td>
                          <td className="pods-cell">{evt.count}</td>
                          <td className="pods-cell">{evt.age}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

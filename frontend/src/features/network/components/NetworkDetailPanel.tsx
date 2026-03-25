import { useEffect, useMemo, useState } from 'react'
import type { DeploymentDetail, DeploymentResource, NetworkTabId } from '../../../shared/types'
import { DeleteWorkloadResource, UpdateWorkloadManifest } from '../../../shared/api'
import Modal from '../../../shared/components/Modal'
import YamlEditor from '../../../shared/components/YamlEditor'
import { valueToneClass } from '../../workloads/shared/detailHelpers'
import { networkSingularLabel, toNetworkAPIKind } from '../networkKinds'
import '../../workloads/pods/PodsTable.css'

export type NetworkDetailsTabId = 'overview' | 'yaml'

interface Props {
  clusterFilename: string
  networkTab: NetworkTabId
  mode: 'split' | 'modal'
  activeDetailsTab: NetworkDetailsTabId
  onDetailsTabChange: (tab: NetworkDetailsTabId) => void
  selectedResource: DeploymentResource
  detail: DeploymentDetail | null
  detailLoading: boolean
  detailError: string | null
  detailsMaximized: boolean
  showMaximizeButton?: boolean
  onToggleMaximize: () => void
  onClose: () => void
}

const DETAIL_TABS: Array<{ id: NetworkDetailsTabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'yaml', label: 'YAML' },
]

function mapEntries(value: Record<string, string>): Array<[string, string]> {
  return Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
}

export default function NetworkDetailPanel({
  clusterFilename,
  networkTab,
  mode,
  activeDetailsTab,
  onDetailsTabChange,
  selectedResource,
  detail,
  detailLoading,
  detailError,
  detailsMaximized,
  showMaximizeButton = true,
  onToggleMaximize,
  onClose,
}: Props) {
  const [yamlValue, setYamlValue] = useState('-')
  const [yamlDirty, setYamlDirty] = useState(false)
  const [yamlSaving, setYamlSaving] = useState(false)
  const [yamlError, setYamlError] = useState<string | null>(null)
  const [yamlSuccess, setYamlSuccess] = useState<string | null>(null)
  const [deletePending, setDeletePending] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)

  const resourceLabel = networkSingularLabel(networkTab)
  const resourceKey = `${networkTab}:${selectedResource.namespace}/${selectedResource.name}`

  useEffect(() => {
    setYamlDirty(false)
    setYamlError(null)
    setYamlSuccess(null)
    setYamlSaving(false)
    setDeletePending(false)
    setDeleteError(null)
    setDeleteConfirmOpen(false)
  }, [resourceKey])

  useEffect(() => {
    if (!yamlDirty) {
      setYamlValue(detail?.manifest ?? '-')
    }
  }, [detail?.manifest, yamlDirty])

  const labels = useMemo(() => mapEntries(detail?.labels ?? {}), [detail?.labels])
  const annotations = useMemo(() => mapEntries(detail?.annotations ?? {}), [detail?.annotations])

  const handleYamlSave = async () => {
    setYamlSaving(true)
    setYamlError(null)
    setYamlSuccess(null)
    try {
      await UpdateWorkloadManifest(
        clusterFilename,
        toNetworkAPIKind(networkTab),
        selectedResource.namespace,
        selectedResource.name,
        yamlValue,
      )
      setYamlDirty(false)
      setYamlSuccess('Saved')
      setTimeout(() => setYamlSuccess(null), 2000)
    } catch (error) {
      setYamlError(error instanceof Error ? error.message : String(error))
    } finally {
      setYamlSaving(false)
    }
  }

  const requestDelete = () => {
    if (deletePending) {
      return
    }
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (deletePending) {
      return
    }
    setDeleteConfirmOpen(false)
    setDeletePending(true)
    setDeleteError(null)
    try {
      await DeleteWorkloadResource(
        clusterFilename,
        toNetworkAPIKind(networkTab),
        selectedResource.namespace,
        selectedResource.name,
      )
      onClose()
    } catch (error) {
      setDeleteError(error instanceof Error ? error.message : String(error))
      setDeletePending(false)
    }
  }

  const statusClass = valueToneClass(detail?.status ?? selectedResource.status)

  return (
    <div className={`pod-detail-panel ${mode === 'modal' ? 'is-modal' : ''}`}>
      <div className="pod-detail-header">
        <div className="pod-detail-header-top">
          <div className="pod-detail-title-row">
            <h3 className="pod-detail-name" title={selectedResource.name}>{selectedResource.name}</h3>
            <span className={`pod-detail-phase ${statusClass}`}>{detail?.status ?? selectedResource.status}</span>
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
        {detailError ? (
          <div className="pods-empty-row error">{detailError}</div>
        ) : detailLoading && !detail ? (
          <div className="pods-empty-row">Loading {resourceLabel.toLowerCase()} details...</div>
        ) : activeDetailsTab === 'yaml' ? (
          <div className="pod-detail-yaml-wrap">
            <YamlEditor
              title={`${selectedResource.name}.yaml`}
              value={yamlValue}
              editSessionKey={resourceKey}
              onChange={value => { setYamlValue(value); setYamlDirty(true) }}
            />
            <div className="pod-detail-yaml-actions">
              <button type="button" className="pod-detail-yaml-save" disabled={!yamlDirty || yamlSaving} onClick={handleYamlSave}>
                {yamlSaving ? 'Saving...' : 'Save'}
              </button>
              {yamlError && <span className="pod-detail-yaml-error">{yamlError}</span>}
              {yamlSuccess && <span className="pod-detail-yaml-success">{yamlSuccess}</span>}
            </div>
          </div>
        ) : (
          <div className="pod-detail-overview">
            <section className="pod-detail-section">
              <h4 className="pod-detail-section-title">{resourceLabel} Info</h4>
              <div className="pod-detail-grid">
                <div className="pod-detail-field"><span className="pod-detail-label">Name</span><span className="pod-detail-value">{detail?.name ?? selectedResource.name}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Namespace</span><span className="pod-detail-value">{detail?.namespace ?? selectedResource.namespace}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Status</span><span className={`pod-detail-value ${statusClass}`}>{detail?.status ?? selectedResource.status}</span></div>
                {detail?.replicas && (
                  <div className="pod-detail-field"><span className="pod-detail-label">Replicas</span><span className="pod-detail-value">{detail.replicas}</span></div>
                )}
                <div className="pod-detail-field"><span className="pod-detail-label">Age</span><span className="pod-detail-value">{detail?.age ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">Created</span><span className="pod-detail-value">{detail?.created ?? '-'}</span></div>
                <div className="pod-detail-field"><span className="pod-detail-label">UID</span><span className="pod-detail-value mono">{detail?.uid ?? '-'}</span></div>
              </div>
            </section>

            {detail?.selector && Object.keys(detail.selector).length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Selector</h4>
                <div className="pod-detail-grid">
                  {Object.entries(detail.selector).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => (
                    <div key={key} className="pod-detail-field">
                      <span className="pod-detail-label" title={key}>{key}</span>
                      <span className="pod-detail-value mono">{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {labels.length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Labels ({labels.length})</h4>
                <div className="pod-detail-grid">
                  {labels.map(([key, value]) => (
                    <div key={key} className="pod-detail-field">
                      <span className="pod-detail-label" title={key}>{key}</span>
                      <span className="pod-detail-value mono" title={value}>{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {annotations.length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Annotations ({annotations.length})</h4>
                <div className="pod-detail-grid">
                  {annotations.map(([key, value]) => (
                    <div key={key} className="pod-detail-field">
                      <span className="pod-detail-label" title={key}>{key}</span>
                      <span className="pod-detail-value mono" title={value}>{value}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {detail?.events && detail.events.length > 0 && (
              <section className="pod-detail-section">
                <h4 className="pod-detail-section-title">Events ({detail.events.length})</h4>
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
                      {detail.events.map((evt, i) => (
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

            <section className="pod-detail-section">
              <div className="pod-detail-danger-zone">
                <button
                  type="button"
                  className="pod-detail-delete-btn"
                  disabled={deletePending}
                  onClick={requestDelete}
                >
                  {deletePending ? 'Deleting...' : `Delete ${resourceLabel}`}
                </button>
                {deleteError && <span className="pod-detail-delete-error">{deleteError}</span>}
              </div>
            </section>
          </div>
        )}
      </div>
      {deleteConfirmOpen && (
        <Modal title={`Confirm Delete ${resourceLabel}`} onClose={() => setDeleteConfirmOpen(false)}>
          <p>
            Delete {resourceLabel.toLowerCase()} <strong>{selectedResource.name}</strong> in
            {' '}
            <strong>{selectedResource.namespace}</strong>
            {' '}
            namespace?
          </p>
          <div className="modal-actions">
            <button type="button" className="btn-secondary" onClick={() => setDeleteConfirmOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn-primary" onClick={handleDelete} disabled={deletePending}>
              {deletePending ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
